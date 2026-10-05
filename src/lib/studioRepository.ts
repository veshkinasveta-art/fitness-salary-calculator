import type {
  BonusTier,
  EmployeeInput,
  PeriodRecord,
  PeriodStatus,
  Product,
  StudioSettings,
} from '../app/model.ts'
import { calculateStudioPeriod } from '../domain/studioCalculation.ts'
import {
  mergeStudioSettings,
  readStoredSpreadsheetId,
  resolveSpreadsheetId,
} from './studioPrefs.ts'
import { isSupabaseConfigured, supabase } from './supabase.ts'

export interface RemoteStudioState {
  studioId: string
  month: string
  employees: EmployeeInput[]
  products: Product[]
  settings: StudioSettings
  history: PeriodRecord[]
}

function validateBonusTiers(tiers: readonly BonusTier[]): BonusTier[] {
  if (tiers.length !== 2) {
    throw new Error('Премиальный фонд должен содержать два уровня')
  }
  const normalized = tiers
    .map((tier) => ({
      thresholdPercent: tier.thresholdPercent,
      fundKopecks: tier.fundKopecks,
    }))
    .sort((left, right) => left.thresholdPercent - right.thresholdPercent)
  normalized.forEach((tier, index) => {
    if (
      !Number.isSafeInteger(tier.thresholdPercent) ||
      tier.thresholdPercent < 0 ||
      tier.thresholdPercent > 1000
    ) {
      throw new Error(`Некорректный процент в строке ${index + 1}`)
    }
    if (!Number.isSafeInteger(tier.fundKopecks) || tier.fundKopecks < 0) {
      throw new Error(`Некорректная сумма премии в строке ${index + 1}`)
    }
  })
  if (normalized[0]!.thresholdPercent === normalized[1]!.thresholdPercent) {
    throw new Error('Проценты уровней премии должны отличаться')
  }
  return normalized
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const start = `${month}-01`
  const lastDay = new Date(year ?? 0, monthNumber ?? 1, 0).getDate()
  const end = `${month}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

export async function pullRemoteStudio(): Promise<RemoteStudioState | null> {
  if (!supabase) return null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: memberships, error: memberError } = await supabase
    .from('studio_members')
    .select('studio_id, role')
    .eq('user_id', user.id)
    .limit(1)
  if (memberError || !memberships?.[0]) return null

  const studioId = memberships[0].studio_id as string
  const { data: studio } = await supabase
    .from('studios')
    .select('id, name, settings')
    .eq('id', studioId)
    .single()
  if (!studio) return null

  const raw = (studio.settings ?? {}) as Partial<StudioSettings>
  const settings = {
    ...raw,
    studioName: studio.name as string,
    googleSpreadsheetId: resolveSpreadsheetId(
      raw.googleSpreadsheetId,
      readStoredSpreadsheetId(),
    ),
  } as StudioSettings

  const [{ data: employees }, { data: products }, { data: periods }] =
    await Promise.all([
      supabase
        .from('employees')
        .select('*')
        .eq('studio_id', studioId)
        .eq('active', true),
      supabase.from('products').select('*').eq('studio_id', studioId),
      supabase
        .from('periods')
        .select('*')
        .eq('studio_id', studioId)
        .order('starts_on', { ascending: false }),
    ])

  return {
    studioId,
    month: new Date().toISOString().slice(0, 7),
    settings,
    employees: (employees ?? []).map((row) => ({
      id: row.id as string,
      name: row.full_name as string,
      role: ((row.metadata as { role?: string } | null)?.role ?? 'Менеджер'),
      color: ((row.metadata as { color?: string } | null)?.color ?? 'sage'),
      shifts: Number((row.metadata as { shifts?: number } | null)?.shifts ?? 0),
      trials: Number((row.metadata as { trials?: number } | null)?.trials ?? 0),
      weight: Number((row.metadata as { weight?: number } | null)?.weight ?? 1),
      sales:
        ((row.metadata as { sales?: Record<string, number> } | null)?.sales ??
          {}),
    })),
    products: (products ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      trainings: Number((row.metadata as { trainings?: number } | null)?.trainings ?? 0),
      priceKopecks: Number(row.unit_price),
      active: Boolean(row.active),
    })),
    history: (periods ?? []).map((row) => ({
      id: row.id as string,
      month: String(row.starts_on).slice(0, 7),
      status: row.status as PeriodStatus,
      updatedAt: row.updated_at as string,
      employees: [],
      result: {
        totalRevenueKopecks: 0,
        totalSalaryKopecks: 0,
        completionPercent: 0,
        bonusFundKopecks: 0,
        employees: [],
      },
    })),
  }
}

export async function pushDraft(input: {
  studioId?: string
  month: string
  employees: EmployeeInput[]
  products: Product[]
  settings: StudioSettings
}): Promise<{ studioId: string; periodId: string }> {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Требуется вход в аккаунт')

  const settings = mergeStudioSettings(
    input.settings,
    input.settings,
    readStoredSpreadsheetId(),
  )

  let studioId = input.studioId
  if (!studioId) {
    const { data: created, error } = await supabase
      .from('studios')
      .insert({
        name: settings.studioName,
        currency_code: 'RUB',
        timezone: 'Europe/Moscow',
        settings,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (error || !created) throw error ?? new Error('Не удалось создать студию')
    studioId = created.id as string
  } else {
    const { error } = await supabase
      .from('studios')
      .update({
        name: settings.studioName,
        settings,
      })
      .eq('id', studioId)
    if (error) throw error
  }

  const { start, end } = monthBounds(input.month)
  const { data: existingPeriod, error: periodLoadError } = await supabase
    .from('periods')
    .select('id, status')
    .eq('studio_id', studioId)
    .eq('starts_on', start)
    .maybeSingle()
  if (periodLoadError) throw periodLoadError

  if (existingPeriod?.status === 'closed') {
    throw new Error('Закрытый период нельзя изменить')
  }

  let periodId = existingPeriod?.id as string | undefined
  if (!periodId) {
    const { data: period, error } = await supabase
      .from('periods')
      .insert({
        studio_id: studioId,
        name: input.month,
        starts_on: start,
        ends_on: end,
        status: 'draft',
      })
      .select('id')
      .single()
    if (error || !period) throw error ?? new Error('Не удалось создать период')
    periodId = period.id as string
  }

  for (const employee of input.employees) {
    const { error } = await supabase.from('employees').upsert({
      id: employee.id,
      studio_id: studioId,
      full_name: employee.name,
      active: true,
      metadata: {
        role: employee.role,
        color: employee.color,
        shifts: employee.shifts,
        trials: employee.trials,
        weight: employee.weight,
        sales: employee.sales,
      },
    })
    if (error) throw error
  }

  for (const product of input.products) {
    const { error } = await supabase.from('products').upsert({
      id: product.id,
      studio_id: studioId,
      name: product.name,
      unit_price: product.priceKopecks,
      active: product.active,
      metadata: { trainings: product.trainings },
    })
    if (error) throw error
  }

  const { error: salesDeleteError } = await supabase
    .from('sales')
    .delete()
    .eq('period_id', periodId)
  if (salesDeleteError) throw salesDeleteError
  const saleRows = input.employees.flatMap((employee) =>
    input.products
      .filter((product) => (employee.sales[product.id] ?? 0) > 0)
      .map((product) => ({
        studio_id: studioId,
        period_id: periodId,
        employee_id: employee.id,
        product_id: product.id,
        occurred_at: `${start}T12:00:00.000Z`,
        quantity: employee.sales[product.id] ?? 0,
        gross_amount:
          (employee.sales[product.id] ?? 0) * product.priceKopecks,
      })),
  )
  if (saleRows.length > 0) {
    const { error } = await supabase.from('sales').insert(saleRows)
    if (error) throw error
  }

  const { result } = calculateStudioPeriod(
    input.employees,
    input.products,
    settings,
  )
  const { error: metricsDeleteError } = await supabase
    .from('employee_period_metrics')
    .delete()
    .eq('period_id', periodId)
  if (metricsDeleteError) throw metricsDeleteError
  if (result.employees.length > 0) {
    const { error } = await supabase.from('employee_period_metrics').insert(
      result.employees.map((employee) => ({
        studio_id: studioId,
        period_id: periodId,
        employee_id: employee.employeeId,
        metrics: {
          memberships: employee.memberships,
          kpiReached: employee.kpiReached,
        },
        base_amount: employee.shiftsPayKopecks,
        sales_bonus: employee.teamBonusKopecks,
        kpi_bonus: employee.kpiBonusKopecks,
      })),
    )
    if (error) throw error
  }

  const { error: periodError } = await supabase
    .from('periods')
    .update({
      status: 'calculated',
      calculated_at: new Date().toISOString(),
    })
    .eq('id', periodId)
    .neq('status', 'closed')
  if (periodError) throw periodError

  return { studioId, periodId }
}

export async function saveRemoteBonusTiers(
  studioId: string,
  tiers: readonly BonusTier[],
): Promise<StudioSettings> {
  if (!supabase) throw new Error('Сначала подключите Supabase')
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!user) throw new Error('Войдите в аккаунт для сохранения в базе')

  const normalized = validateBonusTiers(tiers)
  const { data: studio, error: loadError } = await supabase
    .from('studios')
    .select('id, name, settings, version')
    .eq('id', studioId)
    .single()
  if (loadError) throw loadError

  const currentSettings = (studio.settings ?? {}) as Partial<StudioSettings>
  const nextSettings = {
    ...currentSettings,
    bonusTiers: normalized,
  }
  const { data: saved, error: saveError } = await supabase
    .from('studios')
    .update({ settings: nextSettings })
    .eq('id', studioId)
    .eq('version', studio.version)
    .select('name, settings')
    .single()
  if (saveError) {
    if (saveError.code === 'PGRST116') {
      throw new Error(
        'Настройки были изменены другим пользователем. Обновите страницу и повторите.',
      )
    }
    throw saveError
  }

  const persisted = (saved.settings ?? {}) as Partial<StudioSettings>
  if (!Array.isArray(persisted.bonusTiers)) {
    throw new Error('База не вернула сохранённый премиальный фонд')
  }
  return {
    ...nextSettings,
    ...persisted,
    studioName: saved.name as string,
    bonusTiers: validateBonusTiers(persisted.bonusTiers),
  } as StudioSettings
}

export async function closeRemotePeriod(periodId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.rpc('close_period', { p_period_id: periodId })
  if (error) throw error
}

export { isSupabaseConfigured }
