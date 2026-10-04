import type {
  EmployeeInput,
  PeriodRecord,
  PeriodStatus,
  Product,
  StudioSettings,
} from '../app/model.ts'
import { calculateStudioPeriod } from '../domain/studioCalculation.ts'
import { isSupabaseConfigured, supabase } from './supabase.ts'

export interface RemoteStudioState {
  studioId: string
  month: string
  employees: EmployeeInput[]
  products: Product[]
  settings: StudioSettings
  history: PeriodRecord[]
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

  const settings = {
    ...(studio.settings as StudioSettings),
    studioName: studio.name as string,
  }

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

  let studioId = input.studioId
  if (!studioId) {
    const { data: created, error } = await supabase
      .from('studios')
      .insert({
        name: input.settings.studioName,
        currency_code: 'RUB',
        timezone: 'Europe/Moscow',
        settings: input.settings,
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
        name: input.settings.studioName,
        settings: input.settings,
      })
      .eq('id', studioId)
    if (error) throw error
  }

  const { start, end } = monthBounds(input.month)
  const { data: existingPeriod } = await supabase
    .from('periods')
    .select('id, status')
    .eq('studio_id', studioId)
    .eq('starts_on', start)
    .maybeSingle()

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
    await supabase.from('employees').upsert({
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
  }

  for (const product of input.products) {
    await supabase.from('products').upsert({
      id: product.id,
      studio_id: studioId,
      name: product.name,
      unit_price: product.priceKopecks,
      active: product.active,
      metadata: { trainings: product.trainings },
    })
  }

  await supabase.from('sales').delete().eq('period_id', periodId)
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
    input.settings,
  )
  await supabase.from('employee_period_metrics').delete().eq('period_id', periodId)
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

export async function closeRemotePeriod(periodId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.rpc('close_period', { p_period_id: periodId })
  if (error) throw error
}

export { isSupabaseConfigured }
