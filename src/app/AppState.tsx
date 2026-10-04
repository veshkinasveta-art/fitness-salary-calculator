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
import { isSupabaseConfigured, supabase } from '../lib/supabase.ts'
import {
  closeRemotePeriod,
  pushDraft,
} from '../lib/studioRepository.ts'
import {
  defaultEmployees,
  defaultProducts,
  defaultSettings,
  demoHistory,
} from './demoData.ts'
import type {
  EmployeeInput,
  PeriodRecord,
  Product,
  StudioSettings,
  SyncState,
  TeamResult,
} from './model.ts'

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
  updateEmployee: (employeeId: string, patch: Partial<EmployeeInput>) => void
  updateSale: (employeeId: string, productId: string, quantity: number) => void
  updateSettings: (settings: StudioSettings) => void
  addEmployee: () => void
  saveDraft: () => Promise<void>
  closePeriod: () => Promise<void>
  duplicatePeriod: (period: PeriodRecord) => void
  importBackup: (raw: unknown) => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function AppStateProvider({ children }: PropsWithChildren) {
  const [month, setMonth] = useState(currentMonth)
  const [products] = useState(defaultProducts)
  const [employees, setEmployees] = useState(defaultEmployees)
  const [settings, setSettings] = useState(defaultSettings)
  const [history, setHistory] = useState(demoHistory)
  const [syncState, setSyncState] = useState<SyncState>('local')
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [online, setOnline] = useState(
    () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  )
  const [studioId, setStudioId] = useState<string | null>(null)
  const [periodId, setPeriodId] = useState<string | null>(null)
  const versionRef = useRef(1)
  const hydrated = useRef(false)

  const { result } = useMemo(
    () => calculateStudioPeriod(employees, products, settings),
    [employees, products, settings],
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
    void loadDraft().then((draft) => {
      if (cancelled || !draft || hydrated.current) return
      hydrated.current = true
      setMonth(draft.month)
      setEmployees(draft.employees)
      setSettings(draft.settings)
      setHistory(draft.history)
      setSyncState(draft.syncState)
      versionRef.current = draft.version
    })
    return () => {
      cancelled = true
    }
  }, [])

  const persistLocal = useCallback(
    async (nextSync: SyncState) => {
      versionRef.current += 1
      await saveDraftRecord({
        id: 'current',
        month,
        employees,
        products,
        settings,
        history,
        syncState: nextSync,
        version: versionRef.current,
        updatedAt: new Date().toISOString(),
      })
    },
    [employees, history, month, products, settings],
  )

  const flushQueue = useCallback(async () => {
    if (!isSupabaseConfigured || !online || !supabase) return
    const queue = await listSyncQueue()
    for (const item of queue) {
      try {
        const pushed = await pushDraft({
          studioId: studioId ?? undefined,
          month: item.payload.month,
          employees: item.payload.employees,
          products: item.payload.products,
          settings: item.payload.settings,
        })
        setStudioId(pushed.studioId)
        setPeriodId(pushed.periodId)
        if (item.kind === 'close') {
          await closeRemotePeriod(pushed.periodId)
        }
        await removeSyncItem(item.id)
      } catch {
        setSyncState('error')
        return
      }
    }
  }, [online, studioId])

  const saveDraft = useCallback(async () => {
    setSyncState('pending')
    await persistLocal('pending')
    if (!isSupabaseConfigured) {
      setSyncState('synced')
      setLastSyncedAt(new Date())
      await persistLocal('synced')
      return
    }
    if (!online) {
      await enqueueSync({
        id: `draft-${month}`,
        kind: 'draft',
        payload: {
          id: 'current',
          month,
          employees,
          products,
          settings,
          history,
          syncState: 'pending',
          version: versionRef.current,
          updatedAt: new Date().toISOString(),
        },
        attempts: 0,
      })
      return
    }
    try {
      const pushed = await pushDraft({
        studioId: studioId ?? undefined,
        month,
        employees,
        products,
        settings,
      })
      setStudioId(pushed.studioId)
      setPeriodId(pushed.periodId)
      setSyncState('synced')
      setLastSyncedAt(new Date())
      await persistLocal('synced')
      await flushQueue()
    } catch {
      setSyncState('error')
      await enqueueSync({
        id: `draft-${month}`,
        kind: 'draft',
        payload: {
          id: 'current',
          month,
          employees,
          products,
          settings,
          history,
          syncState: 'error',
          version: versionRef.current,
          updatedAt: new Date().toISOString(),
        },
        attempts: 1,
      })
    }
  }, [
    employees,
    flushQueue,
    history,
    month,
    online,
    persistLocal,
    products,
    settings,
    studioId,
  ])

  const closePeriod = useCallback(async () => {
    if (isSupabaseConfigured && !online) {
      throw new Error('Закрытие периода доступно только при подключении к сети')
    }
    await saveDraft()
    if (isSupabaseConfigured && periodId) {
      await closeRemotePeriod(periodId)
    }
    setHistory((current) => {
      const record: PeriodRecord = {
        id: month,
        month,
        status: 'closed',
        updatedAt: new Date().toISOString(),
        employees,
        settings,
        result,
      }
      return [...current.filter((item) => item.month !== month), record].sort(
        (a, b) => b.month.localeCompare(a.month),
      )
    })
    setSyncState('synced')
    setLastSyncedAt(new Date())
  }, [employees, month, online, periodId, result, saveDraft, settings])

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
        sales: Object.fromEntries(products.map((product) => [product.id, 0])),
      },
    ])
    setSyncState('pending')
  }, [products])

  const duplicatePeriod = useCallback((period: PeriodRecord) => {
    setMonth(currentMonth())
    setEmployees(period.employees)
    if (period.settings) setSettings(period.settings)
    setSyncState('pending')
  }, [])

  const importBackup = useCallback((raw: unknown) => {
    const backup: StudioBackup = parseBackup(raw)
    setSettings(backup.settings)
    setEmployees(backup.employees)
    setHistory(backup.history)
    if (backup.month) setMonth(backup.month)
    setSyncState('pending')
  }, [])

  const value = useMemo<AppStateValue>(
    () => ({
      month,
      setMonth,
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
      updateEmployee,
      updateSale,
      updateSettings: (next) => {
        setSettings(next)
        setSyncState('pending')
      },
      addEmployee,
      saveDraft,
      closePeriod,
      duplicatePeriod,
      importBackup,
    }),
    [
      addEmployee,
      closePeriod,
      duplicatePeriod,
      employees,
      history,
      importBackup,
      lastSyncedAt,
      month,
      online,
      periodId,
      products,
      result,
      saveDraft,
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
