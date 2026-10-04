export type PeriodStatus = 'draft' | 'calculated' | 'closed'
export type SyncState = 'local' | 'pending' | 'synced' | 'error'

export interface Product {
  id: string
  name: string
  trainings: number
  priceKopecks: number
  active: boolean
}

export interface EmployeeInput {
  id: string
  name: string
  role: string
  color: string
  shifts: number
  trials: number
  sales: Record<string, number>
  weight: number
}

export interface BonusTier {
  thresholdPercent: number
  fundKopecks: number
}

export interface StudioSettings {
  studioName: string
  teamPlanKopecks: number
  shiftCostKopecks: number
  bonusTiers: BonusTier[]
  kpiTrials: number
  kpiMemberships: number
  kpiAmountKopecks: number
  distribution: 'proportional' | 'equal' | 'weighted'
}

export interface EmployeeResult {
  employeeId: string
  revenueKopecks: number
  revenueShare: number
  shiftsPayKopecks: number
  teamBonusKopecks: number
  kpiBonusKopecks: number
  salaryKopecks: number
  memberships: number
  kpiReached: boolean
}

export interface TeamResult {
  totalRevenueKopecks: number
  totalSalaryKopecks: number
  completionPercent: number
  bonusFundKopecks: number
  employees: EmployeeResult[]
}

export interface PeriodRecord {
  id: string
  month: string
  status: PeriodStatus
  updatedAt: string
  employees: EmployeeInput[]
  settings?: StudioSettings
  result: TeamResult
}
