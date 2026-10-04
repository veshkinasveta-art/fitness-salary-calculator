import { z } from 'zod'
import type {
  EmployeeInput,
  PeriodRecord,
  Product,
  StudioSettings,
} from '../app/model.ts'

const moneySchema = z
  .number()
  .int()
  .nonnegative()
  .refine((value) => Number.isSafeInteger(value), 'unsafe integer')

const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  trainings: z.number().int().nonnegative(),
  priceKopecks: moneySchema,
  active: z.boolean(),
})

const employeeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string(),
  color: z.string(),
  shifts: z.number().int().nonnegative(),
  trials: z.number().int().nonnegative(),
  sales: z.record(z.string(), z.number().int().nonnegative()),
  weight: z.number().int().nonnegative(),
})

const settingsSchema = z.object({
  studioName: z.string().min(1),
  teamPlanKopecks: moneySchema,
  shiftCostKopecks: moneySchema,
  bonusTiers: z
    .array(
      z.object({
        thresholdPercent: z.number().int().nonnegative(),
        fundKopecks: moneySchema,
      }),
    )
    .min(1),
  kpiTrials: z.number().int().nonnegative(),
  kpiMemberships: z.number().int().nonnegative(),
  kpiAmountKopecks: moneySchema,
  distribution: z.enum(['proportional', 'equal', 'weighted']),
})

const periodSchema = z.object({
  id: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  status: z.enum(['draft', 'calculated', 'closed']),
  updatedAt: z.string(),
  employees: z.array(employeeSchema),
  settings: settingsSchema.optional(),
  result: z.object({
    totalRevenueKopecks: moneySchema,
    totalSalaryKopecks: moneySchema,
    completionPercent: z.number().finite(),
    bonusFundKopecks: moneySchema,
    employees: z.array(z.object({
      employeeId: z.string(),
      revenueKopecks: moneySchema,
      revenueShare: z.number().finite(),
      shiftsPayKopecks: moneySchema,
      teamBonusKopecks: moneySchema,
      kpiBonusKopecks: moneySchema,
      salaryKopecks: moneySchema,
      memberships: z.number().int().nonnegative(),
      kpiReached: z.boolean(),
    })),
  }),
})

export const BACKUP_SCHEMA_VERSION = 1

export const backupSchema = z.object({
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  exportedAt: z.string(),
  settings: settingsSchema,
  employees: z.array(employeeSchema).min(1),
  products: z.array(productSchema).optional(),
  history: z.array(periodSchema),
  month: z.string().optional(),
})

export type StudioBackup = z.infer<typeof backupSchema>

export function createBackup(input: {
  settings: StudioSettings
  employees: EmployeeInput[]
  products: Product[]
  history: PeriodRecord[]
  month?: string
}): StudioBackup {
  return backupSchema.parse({
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: input.settings,
    employees: input.employees,
    products: input.products,
    history: input.history,
    month: input.month,
  })
}

export function parseBackup(raw: unknown): StudioBackup {
  return backupSchema.parse(raw)
}
