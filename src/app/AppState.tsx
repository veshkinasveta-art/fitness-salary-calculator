import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { calculateStudioPeriod } from '../domain/studioCalculation.ts'
import { parseBackup, type StudioBackup } from '../lib/backup.ts'
import {
  enqueueSync,
  listSyncQueue,
  loadDraft,
  removeSyncItem,
  saveDraftRecord,
} from '../lib/offlineStore.ts'
import {
  mergeProducts,
  mergeStudioSettings,
  pickDefined,
  readStoredSpreadsheetId,
  writeStoredSpreadsheetId,
} from '../lib/studioPrefs.ts'
import {
  closeRemotePeriod,
  pullRemoteStudio,
  pushDraft,
  saveRemoteBonusTiers,
} from '../lib/studioRepository.ts'
import { isSupabaseConfigured, supabase } from '../lib/supabase.ts'
import {
  defaultEmployees,
  defaultProducts,
  defaultSettings,
  demoHistory,
} from './demoData.ts'
import type {
  BonusTier,
  EmployeeInput,
  PeriodRecord,
  Product,
  StudioSettings,
  SyncState,
  TeamResult,
} from './model.ts'

interface StudioSnapshot {
  month: string
  employees: EmployeeInput[]
  products: Product[]
  settings: StudioSettings
  history: PeriodRecord[]
  studioId: string | null
  periodId: string | null
}

interface StudioSnapshotPatch extends Partial<Omit<StudioSnapshot, 'settings'>> {
  settings?: Partial<StudioSettings>
}

interface AppStateValue {
  month: string
  setMonth: (month: string) => void
  products: Product[]
  employees: EmployeeInput[]
  settings: StudioSettings
  result: TeamResult
  history: PeriodRecord[]
  syncState: SyncState
  lastSyncedAt: Date | null
  online: boolean
  studioId: string | null
  periodId: string | null
  ready: boolean
  updateEmployee: (employeeId: string, patch: Partial<EmployeeInput>) => void
  updateSale: (employeeId: string, productId: string, quantity: number) => void
  updateSettings: (settings: StudioSettings) => void
  updateProducts: (products: Product[]) => void
  addEmployee: () => void
  saveDraft: () => Promise<void>
  commitStudio: (patch?: StudioSnapshotPatch) => Promise<void>
  saveBonusTiers: (
    tiers: BonusTier[],
  ) => Promise<'remote' | 'local' | 'queued'>
  closePeriod: () => Promise<void>
  duplicatePeriod: (period: PeriodRecord) => void
  importBackup: (raw: unknown) => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function applySnapshotPatch(
  current: StudioSnapshot,
  patch: StudioSnapshotPatch = {},
): StudioSnapshot {
  const settings = mergeStudioSettings(
    current.settings,
    patch.settings ?? current.settings,
    readStoredSpreadsheetId(),
  )
  if (settings.googleSpreadsheetId) {
    writeStoredSpreadsheetId(settings.googleSpreadsheetId)
  }
  return {
    month: patch.month ?? current.month,
    employees: patch.employees ?? current.employees,
    products: mergeProducts(current.products, patch.products ?? current.products),
    settings,
    history: patch.history ?? current.history,
    studioId: patch.studioId ?? current.studioId,
    periodId: patch.periodId ?? current.periodId,
  }
}

export function AppStateProvider({ children }: PropsWithChildren) {
  const [month, setMonthState] = useState(currentMonth)
  const [products, setProducts] = useState(defaultProducts)
  const [employees, setEmployees] = useState(defaultEmployees)
  const [settings, setSettings] = useState(() =>
    mergeStudioSettings(defaultSettings, {}, readStoredSpreadsheetId()),
  )
  const [history, setHistory] = useState(demoHistory)
  const [syncState, setSyncState] = useState<SyncState>('local')
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [online, setOnline] = useState(
    () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  )
  const [studioId, setStudioId] = useState<string | null>(null)
  const [periodId, setPeriodId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const versionRef = useRef(1)
  const snapshotRef = useRef<StudioSnapshot>({
    month,
    employees,
    products,
    settings,
    history,
    studioId,
    periodId,
  })

  snapshotRef.current = {
    month,
    employees,
    products,
    settings,
    history,
    studioId,
    periodId,
  }

  const { result } = useMemo(
    () => calculateStudioPeriod(employees, products, settings),
    [employees, products, settings],
  )

  const applySnapshot = useCallback((next: StudioSnapshot) => {
    snapshotRef.current = next
    setMonthState(next.month)
    setEmployees(next.employees)
    setProducts(next.products)
    setSettings(next.settings)
    setHistory(next.history)
    setStudioId(next.studioId)
    setPeriodId(next.periodId)
  }, [])

  const persistSnapshot = useCallback(
    async (nextSync: SyncState, snapshot: StudioSnapshot) => {
      if (snapshot.settings.googleSpreadsheetId) {
        writeStoredSpreadsheetId(snapshot.settings.googleSpreadsheetId)
      }
      versionRef.current += 1
      await saveDraftRecord({
        id: 'current',
        month: snapshot.month,
        employees: snapshot.employees,
        products: snapshot.products,
        settings: snapshot.settings,
        history: snapshot.history,
        studioId: snapshot.studioId,
        periodId: snapshot.periodId,
        syncState: nextSync,
        version: versionRef.current,
        updatedAt: new Date().toISOString(),
      })
    },
    [],
  )

  const pushSnapshot = useCallback(async (snapshot: StudioSnapshot) => {
    if (!isSupabaseConfigured || !online || !supabase) return snapshot
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Войдите в аккаунт для сохранения в базе')
    const pushed = await pushDraft({
      studioId: snapshot.studioId ?? undefined,
      month: snapshot.month,
      employees: snapshot.employees,
      products: snapshot.products,
      settings: snapshot.settings,
    })
    return {
      ...snapshot,
      studioId: pushed.studioId,
      periodId: pushed.periodId,
    }
  }, [online])

  const commitStudio = useCallback(
    async (patch: StudioSnapshotPatch = {}) => {
      const snapshot = applySnapshotPatch(snapshotRef.current, patch)
      applySnapshot(snapshot)
      setSyncState('pending')
      await persistSnapshot('pending', snapshot)
      if (!isSupabaseConfigured) {
        setSyncState('local')
        await persistSnapshot('local', snapshot)
        return
      }
      if (!online) {
        await enqueueSync({
          id: `draft-${snapshot.month}`,
          kind: 'draft',
          payload: {
            id: 'current',
            ...snapshot,
            syncState: 'pending',
            version: versionRef.current,
            updatedAt: new Date().toISOString(),
          },
          attempts: 0,
        })
        return
      }
      try {
        const pushed = await pushSnapshot(snapshot)
        applySnapshot(pushed)
        setSyncState('synced')
        setLastSyncedAt(new Date())
        await persistSnapshot('synced', pushed)
        const queue = await listSyncQueue()
        for (const item of queue) {
          const queued = applySnapshotPatch(pushed, {
            month: item.payload.month,
            employees: item.payload.employees,
            products: item.payload.products,
            settings: item.payload.settings,
            history: item.payload.history,
          })
          await pushSnapshot(queued)
          await removeSyncItem(item.id)
        }
      } catch (error) {
        setSyncState('error')
        await enqueueSync({
          id: `draft-${snapshot.month}`,
          kind: 'draft',
          payload: {
            id: 'current',
            ...snapshot,
            syncState: 'error',
            version: versionRef.current,
            updatedAt: new Date().toISOString(),
          },
          attempts: 1,
        })
        throw error
      }
    },
    [applySnapshot, online, persistSnapshot, pushSnapshot],
  )

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const draft = await loadDraft()
      const storedId = readStoredSpreadsheetId()
      let snapshot: StudioSnapshot = applySnapshotPatch(
        {
          month: currentMonth(),
          employees: defaultEmployees,
          products: defaultProducts,
          settings: defaultSettings,
          history: demoHistory,
          studioId: null,
          periodId: null,
        },
        draft
          ? {
              month: draft.month,
              employees: draft.employees,
              products: draft.products,
              settings: draft.settings,
              history: draft.history,
              studioId: draft.studioId ?? null,
              periodId: draft.periodId ?? null,
            }
          : { settings: { ...defaultSettings, googleSpreadsheetId: storedId } },
      )
      if (!cancelled && isSupabaseConfigured && supabase) {
        try {
          const remote = await pullRemoteStudio()
          if (remote) {
            const keepUnsyncedLocal =
              draft !== undefined && draft.syncState !== 'synced'
            snapshot = applySnapshotPatch(snapshot, {
              studioId: remote.studioId,
              employees:
                remote.employees.length > 0 ? remote.employees : snapshot.employees,
              products: keepUnsyncedLocal
                ? snapshot.products
                : remote.products,
              settings: keepUnsyncedLocal
                ? pickDefined(snapshot.settings)
                : pickDefined(remote.settings),
              history:
                remote.history.length > 0 ? remote.history : snapshot.history,
            })
          }
        } catch {
          // Keep the local snapshot if the remote is unavailable.
        }
      }
      if (cancelled) return
      applySnapshot(snapshot)
      if (snapshot.settings.googleSpreadsheetId) {
        writeStoredSpreadsheetId(snapshot.settings.googleSpreadsheetId)
      }
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [applySnapshot])

  const saveDraft = useCallback(async () => {
    await commitStudio()
  }, [commitStudio])

  const saveBonusTiers = useCallback(
    async (tiers: BonusTier[]) => {
      const localSnapshot = applySnapshotPatch(snapshotRef.current, {
        settings: { bonusTiers: tiers },
      })
      applySnapshot(localSnapshot)

      if (!isSupabaseConfigured) {
        await persistSnapshot('local', localSnapshot)
        setSyncState('local')
        return 'local'
      }
      if (!online) {
        await persistSnapshot('pending', localSnapshot)
        await enqueueSync({
          id: `draft-${localSnapshot.month}`,
          kind: 'draft',
          payload: {
            id: 'current',
            ...localSnapshot,
            syncState: 'pending',
            version: versionRef.current,
            updatedAt: new Date().toISOString(),
          },
          attempts: 0,
        })
        setSyncState('pending')
        return 'queued'
      }
      setSyncState('pending')
      await persistSnapshot('pending', localSnapshot)
      try {
        let targetStudioId = snapshotRef.current.studioId
        if (!targetStudioId) {
          const remote = await pullRemoteStudio()
          targetStudioId = remote?.studioId ?? null
        }
        if (!targetStudioId) {
          throw new Error('Студия не найдена. Войдите в аккаунт и повторите.')
        }
        const persistedSettings = await saveRemoteBonusTiers(
          targetStudioId,
          tiers,
        )
        const next = applySnapshotPatch(snapshotRef.current, {
          studioId: targetStudioId,
          settings: persistedSettings,
        })
        applySnapshot(next)
        await persistSnapshot('synced', next)
        setSyncState('synced')
        setLastSyncedAt(new Date())
        return 'remote'
      } catch (error) {
        setSyncState('error')
        await persistSnapshot('error', localSnapshot)
        await enqueueSync({
          id: `draft-${localSnapshot.month}`,
          kind: 'draft',
          payload: {
            id: 'current',
            ...localSnapshot,
            syncState: 'error',
            version: versionRef.current,
            updatedAt: new Date().toISOString(),
          },
          attempts: 1,
          lastError:
            error instanceof Error ? error.message : 'Ошибка сохранения фонда',
        })
        throw error
      }
    },
    [applySnapshot, online, persistSnapshot],
  )

  const closePeriod = useCallback(async () => {
    if (isSupabaseConfigured && !online) {
      throw new Error('Закрытие периода доступно только при подключении к сети')
    }
    const current = snapshotRef.current
    const { result: closedResult } = calculateStudioPeriod(
      current.employees,
      current.products,
      current.settings,
    )
    await commitStudio()
    const record: PeriodRecord = {
      id: current.month,
      month: current.month,
      status: 'closed',
      updatedAt: new Date().toISOString(),
      employees: current.employees,
      settings: current.settings,
      result: closedResult,
    }
    const nextHistory = [
      ...current.history.filter((item) => item.month !== current.month),
      record,
    ].sort((a, b) => b.month.localeCompare(a.month))
    await commitStudio({ history: nextHistory })
    if (isSupabaseConfigured && snapshotRef.current.periodId) {
      await closeRemotePeriod(snapshotRef.current.periodId)
    }
  }, [commitStudio, online])

  const updateEmployee = useCallback(
    (employeeId: string, patch: Partial<EmployeeInput>) => {
      setEmployees((current) =>
        current.map((employee) =>
          employee.id === employeeId ? { ...employee, ...patch } : employee,
        ),
      )
      setSyncState('pending')
    },
    [],
  )

  const updateSale = useCallback(
    (employeeId: string, productId: string, quantity: number) => {
      setEmployees((current) =>
        current.map((employee) =>
          employee.id === employeeId
            ? {
                ...employee,
                sales: {
                  ...employee.sales,
                  [productId]: Math.max(0, Math.floor(quantity)),
                },
              }
            : employee,
        ),
      )
      setSyncState('pending')
    },
    [],
  )

  const addEmployee = useCallback(() => {
    setEmployees((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: `Сотрудник ${current.length + 1}`,
        role: 'Менеджер',
        color: 'blue',
        shifts: 0,
        trials: 0,
        weight: 1,
        sales: Object.fromEntries(
          snapshotRef.current.products.map((product) => [product.id, 0]),
        ),
      },
    ])
    setSyncState('pending')
  }, [])

  const duplicatePeriod = useCallback((period: PeriodRecord) => {
    setMonthState(currentMonth())
    setEmployees(period.employees)
    if (period.settings) {
      setSettings((current) => mergeStudioSettings(current, period.settings!))
    }
    setSyncState('pending')
  }, [])

  const importBackup = useCallback(
    (raw: unknown) => {
      const backup: StudioBackup = parseBackup(raw)
      void commitStudio({
        settings: backup.settings,
        employees: backup.employees,
        products: backup.products,
        history: backup.history,
        month: backup.month,
      })
    },
    [commitStudio],
  )

  const value = useMemo<AppStateValue>(
    () => ({
      month,
      setMonth: (next) => {
        setMonthState(next)
        setSyncState('pending')
      },
      products,
      employees,
      settings,
      result,
      history,
      syncState,
      lastSyncedAt,
      online,
      studioId,
      periodId,
      ready,
      updateEmployee,
      updateSale,
      updateSettings: (next) => {
        void commitStudio({ settings: next })
      },
      updateProducts: (next) => {
        void commitStudio({ products: next })
      },
      addEmployee,
      saveDraft,
      commitStudio,
      saveBonusTiers,
      closePeriod,
      duplicatePeriod,
      importBackup,
    }),
    [
      addEmployee,
      closePeriod,
      commitStudio,
      duplicatePeriod,
      employees,
      history,
      importBackup,
      lastSyncedAt,
      month,
      online,
      periodId,
      products,
      ready,
      result,
      saveDraft,
      saveBonusTiers,
      settings,
      studioId,
      syncState,
      updateEmployee,
      updateSale,
    ],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState() {
  const context = useContext(AppStateContext)
  if (!context) throw new Error('useAppState must be used inside AppStateProvider')
  return context
}
