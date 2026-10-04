import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  EmployeeInput,
  PeriodRecord,
  Product,
  StudioSettings,
  SyncState,
} from '../app/model.ts'

const DB_NAME = 'fitness-salary-calculator'
const DB_VERSION = 1

export interface DraftRecord {
  id: string
  month: string
  employees: EmployeeInput[]
  products: Product[]
  settings: StudioSettings
  history: PeriodRecord[]
  syncState: SyncState
  version: number
  updatedAt: string
}

export interface SyncQueueItem {
  id: string
  kind: 'draft' | 'close'
  payload: DraftRecord
  attempts: number
  lastError?: string
}

interface SalaryDb extends DBSchema {
  drafts: {
    key: string
    value: DraftRecord
  }
  queue: {
    key: string
    value: SyncQueueItem
  }
}

let dbPromise: Promise<IDBPDatabase<SalaryDb>> | null = null

function openSalaryDb() {
  dbPromise ??= openDB<SalaryDb>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('drafts')) {
        database.createObjectStore('drafts', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('queue')) {
        database.createObjectStore('queue', { keyPath: 'id' })
      }
    },
  })
  return dbPromise
}

export async function loadDraft(id = 'current'): Promise<DraftRecord | undefined> {
  const db = await openSalaryDb()
  return db.get('drafts', id)
}

export async function saveDraftRecord(draft: DraftRecord): Promise<void> {
  const db = await openSalaryDb()
  await db.put('drafts', draft)
}

export async function enqueueSync(item: SyncQueueItem): Promise<void> {
  const db = await openSalaryDb()
  await db.put('queue', item)
}

export async function listSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await openSalaryDb()
  return db.getAll('queue')
}

export async function removeSyncItem(id: string): Promise<void> {
  const db = await openSalaryDb()
  await db.delete('queue', id)
}
