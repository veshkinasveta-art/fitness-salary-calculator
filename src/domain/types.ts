export type Money = number
export type BasisPoints = number

export type DistributionMode = 'equal' | 'proportional' | 'weighted'
export type KpiGroupOperator = 'AND' | 'OR'
export type KpiComparator = 'gte' | 'gt' | 'lte' | 'lt' | 'eq'

export interface Product {
  readonly id: string
  readonly name: string
  readonly price: Money
}

export interface Sale {
  readonly productId: string
  readonly quantity: number
  readonly employeeId?: string
}

export interface ShiftSummary {
  readonly worked: number
  readonly planned: number
}

export interface Employee {
  readonly id: string
  readonly name: string
  readonly baseSalary: Money
  readonly shifts?: ShiftSummary
  readonly weight?: number
  readonly metrics?: Readonly<Record<string, number>>
}

export interface BonusTier {
  /** Inclusive revenue-plan boundary, in percent. */
  readonly thresholdPercent: number
  /** Share of revenue placed in the team bonus pool. 100 bp = 1%. */
  readonly bonusBasisPoints?: BasisPoints
  /** Fixed team bonus pool in kopecks. Mutually exclusive with bonusBasisPoints. */
  readonly fundKopecks?: Money
}

export interface KpiCondition {
  readonly metric: string
  readonly comparator: KpiComparator
  readonly value: number
}

export interface KpiGroup {
  readonly id: string
  readonly operator: KpiGroupOperator
  readonly conditions: readonly KpiCondition[]
  /** Individual bonus on shift-adjusted base salary when the group passes. */
  readonly bonusBasisPoints?: BasisPoints
  /** Fixed individual bonus in kopecks. Mutually exclusive with bonusBasisPoints. */
  readonly bonusKopecks?: Money
}

export interface SalaryCalculationInput {
  readonly employees: readonly Employee[]
  readonly products: readonly Product[]
  readonly sales: readonly Sale[]
  readonly revenueTarget: Money
  readonly bonusTiers?: readonly BonusTier[]
  readonly distribution?: DistributionMode
  readonly kpiGroups?: readonly KpiGroup[]
}

export interface KpiGroupResult {
  readonly groupId: string
  readonly passed: boolean
  readonly bonus: Money
}

export interface EmployeeSalaryResult {
  readonly employeeId: string
  readonly baseSalary: Money
  readonly shiftSalary: Money
  readonly teamBonus: Money
  readonly kpiBonus: Money
  readonly totalSalary: Money
  readonly kpiGroups: readonly KpiGroupResult[]
}

export interface SalaryCalculationSnapshot {
  readonly input: SalaryCalculationInput
  readonly revenue: Money
  readonly attainmentPercent: number
  readonly appliedTier: BonusTier | null
  readonly teamBonusPool: Money
  readonly distributedTeamBonus: Money
  readonly employees: readonly EmployeeSalaryResult[]
}

export type DomainErrorCode =
  | 'INVALID_MONEY'
  | 'INVALID_NUMBER'
  | 'DUPLICATE_ID'
  | 'UNKNOWN_REFERENCE'
  | 'INVALID_TIER'
  | 'INVALID_KPI'
  | 'OVERFLOW'

export class DomainValidationError extends Error {
  readonly name = 'DomainValidationError'
  readonly code: DomainErrorCode
  readonly path: string

  constructor(
    code: DomainErrorCode,
    path: string,
    message: string,
  ) {
    super(`${path}: ${message}`)
    this.code = code
    this.path = path
  }
}

