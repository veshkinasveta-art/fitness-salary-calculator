import {
  assertMoney,
  assertSafeInteger,
  checkedAdd,
  checkedMultiply,
  distributeLargestRemainder,
  multiplyRatio,
  sumMoney,
} from './money.ts'
import { DomainValidationError } from './types.ts'
import type {
  BonusTier,
  Employee,
  EmployeeSalaryResult,
  KpiCondition,
  KpiGroup,
  KpiGroupResult,
  Money,
  Product,
  SalaryCalculationInput,
  SalaryCalculationSnapshot,
  Sale,
} from './types.ts'

export const DEFAULT_BONUS_TIERS: readonly BonusTier[] = deepFreeze([
  { thresholdPercent: 80, bonusBasisPoints: 300 },
  { thresholdPercent: 100, bonusBasisPoints: 500 },
])
export const DEFAULT_DISTRIBUTION = 'equal' as const
export const DEFAULT_KPI_GROUPS: readonly KpiGroup[] = deepFreeze([])

export function calculateSalary(
  source: SalaryCalculationInput,
): SalaryCalculationSnapshot {
  const input = normalizeAndValidate(source)
  const productById = new Map(input.products.map((product) => [product.id, product]))
  const salesRevenue = input.sales.map((sale, index) =>
    checkedMultiply(
      productById.get(sale.productId)!.price,
      sale.quantity,
      `sales[${index}]`,
    ),
  )
  const revenue = sumMoney(salesRevenue, 'revenue')
  const appliedTier = selectTier(revenue, input.revenueTarget, input.bonusTiers!)
  const teamBonusPool = appliedTier
    ? appliedTier.fundKopecks !== undefined
      ? appliedTier.fundKopecks
      : multiplyRatio(
          revenue,
          appliedTier.bonusBasisPoints ?? 0,
          10_000,
          'teamBonusPool',
        )
    : 0

  const weights = buildDistributionWeights(input, salesRevenue)
  const teamBonuses = distributeLargestRemainder(
    teamBonusPool,
    weights,
    'teamBonus',
  )
  const employees = input.employees.map((employee) =>
    calculateEmployee(employee, teamBonuses[employee.id]!, input.kpiGroups!),
  )

  return deepFreeze({
    input,
    revenue,
    attainmentPercent: (revenue * 100) / input.revenueTarget,
    appliedTier,
    teamBonusPool,
    distributedTeamBonus: sumMoney(
      employees.map((employee) => employee.teamBonus),
      'distributedTeamBonus',
    ),
    employees,
  })
}

export const calculateSalaries = calculateSalary

function normalizeAndValidate(
  source: SalaryCalculationInput,
): SalaryCalculationInput {
  if (!source || typeof source !== 'object') {
    throw new DomainValidationError('INVALID_NUMBER', 'input', 'is required')
  }
  assertMoney(source.revenueTarget, 'revenueTarget')
  if (source.revenueTarget === 0) {
    throw new DomainValidationError(
      'INVALID_MONEY',
      'revenueTarget',
      'must be greater than zero',
    )
  }
  if (!Array.isArray(source.employees) || source.employees.length === 0) {
    throw new DomainValidationError(
      'INVALID_NUMBER',
      'employees',
      'must contain at least one employee',
    )
  }

  const employees = [...source.employees]
    .map(validateEmployee)
    .sort(byId)
  const products = [...source.products].map(validateProduct).sort(byId)
  ensureUniqueIds(employees, 'employees')
  ensureUniqueIds(products, 'products')
  const employeeIds = new Set(employees.map(({ id }) => id))
  const productIds = new Set(products.map(({ id }) => id))
  const sales = [...source.sales]
    .map((sale, index) => validateSale(sale, index, productIds, employeeIds))
    .sort(
      (a, b) =>
        a.productId.localeCompare(b.productId) ||
        (a.employeeId ?? '').localeCompare(b.employeeId ?? '') ||
        a.quantity - b.quantity,
    )
  const bonusTiers = [...(source.bonusTiers ?? DEFAULT_BONUS_TIERS)]
    .map(validateTier)
    .sort((a, b) => a.thresholdPercent - b.thresholdPercent)
  for (let index = 1; index < bonusTiers.length; index += 1) {
    if (
      bonusTiers[index - 1]!.thresholdPercent ===
      bonusTiers[index]!.thresholdPercent
    ) {
      throw new DomainValidationError(
        'INVALID_TIER',
        `bonusTiers[${index}].thresholdPercent`,
        'must be unique',
      )
    }
  }
  const kpiGroups = [...(source.kpiGroups ?? DEFAULT_KPI_GROUPS)]
    .map(validateKpiGroup)
    .sort(byId)
  ensureUniqueIds(kpiGroups, 'kpiGroups')
  const distribution = source.distribution ?? DEFAULT_DISTRIBUTION
  if (!['equal', 'proportional', 'weighted'].includes(distribution)) {
    throw new DomainValidationError(
      'INVALID_NUMBER',
      'distribution',
      'must be equal, proportional, or weighted',
    )
  }

  return deepFreeze({
    employees,
    products,
    sales,
    revenueTarget: source.revenueTarget,
    bonusTiers,
    distribution,
    kpiGroups,
  })
}

function validateEmployee(employee: Employee, index: number): Employee {
  validateId(employee.id, `employees[${index}].id`)
  assertMoney(employee.baseSalary, `employees[${index}].baseSalary`)
  if (employee.weight !== undefined) {
    assertSafeInteger(employee.weight, `employees[${index}].weight`)
  }
  if (employee.shifts) {
    assertSafeInteger(employee.shifts.worked, `employees[${index}].shifts.worked`)
    assertSafeInteger(employee.shifts.planned, `employees[${index}].shifts.planned`)
    if (
      employee.shifts.planned === 0 ||
      employee.shifts.worked > employee.shifts.planned
    ) {
      throw new DomainValidationError(
        'INVALID_NUMBER',
        `employees[${index}].shifts`,
        'planned must be positive and worked cannot exceed planned',
      )
    }
  }
  const metrics = { ...(employee.metrics ?? {}) }
  for (const [metric, value] of Object.entries(metrics)) {
    if (!Number.isFinite(value)) {
      throw new DomainValidationError(
        'INVALID_NUMBER',
        `employees[${index}].metrics.${metric}`,
        'must be finite',
      )
    }
  }
  return {
    id: employee.id,
    name: employee.name,
    baseSalary: employee.baseSalary,
    ...(employee.shifts ? { shifts: { ...employee.shifts } } : {}),
    ...(employee.weight !== undefined ? { weight: employee.weight } : {}),
    metrics,
  }
}

function validateProduct(product: Product, index: number): Product {
  validateId(product.id, `products[${index}].id`)
  assertMoney(product.price, `products[${index}].price`)
  return { ...product }
}

function validateSale(
  sale: Sale,
  index: number,
  productIds: ReadonlySet<string>,
  employeeIds: ReadonlySet<string>,
): Sale {
  assertSafeInteger(sale.quantity, `sales[${index}].quantity`)
  if (!productIds.has(sale.productId)) {
    throw new DomainValidationError(
      'UNKNOWN_REFERENCE',
      `sales[${index}].productId`,
      `unknown product "${sale.productId}"`,
    )
  }
  if (sale.employeeId !== undefined && !employeeIds.has(sale.employeeId)) {
    throw new DomainValidationError(
      'UNKNOWN_REFERENCE',
      `sales[${index}].employeeId`,
      `unknown employee "${sale.employeeId}"`,
    )
  }
  return { ...sale }
}

function validateTier(tier: BonusTier, index: number): BonusTier {
  assertSafeInteger(tier.thresholdPercent, `bonusTiers[${index}].thresholdPercent`)
  const hasFund = tier.fundKopecks !== undefined
  const hasShare = tier.bonusBasisPoints !== undefined
  if (hasFund === hasShare) {
    throw new DomainValidationError(
      'INVALID_TIER',
      `bonusTiers[${index}]`,
      'must define exactly one of fundKopecks or bonusBasisPoints',
    )
  }
  if (hasFund) {
    assertMoney(tier.fundKopecks!, `bonusTiers[${index}].fundKopecks`)
  }
  if (hasShare) {
    assertSafeInteger(
      tier.bonusBasisPoints!,
      `bonusTiers[${index}].bonusBasisPoints`,
    )
    if (tier.bonusBasisPoints! > 10_000) {
      throw new DomainValidationError(
        'INVALID_TIER',
        `bonusTiers[${index}].bonusBasisPoints`,
        'cannot exceed 10000',
      )
    }
  }
  return { ...tier }
}

function validateKpiGroup(group: KpiGroup, index: number): KpiGroup {
  validateId(group.id, `kpiGroups[${index}].id`)
  if (group.operator !== 'AND' && group.operator !== 'OR') {
    throw new DomainValidationError(
      'INVALID_KPI',
      `kpiGroups[${index}].operator`,
      'must be AND or OR',
    )
  }
  const hasFixed = group.bonusKopecks !== undefined
  const hasShare = group.bonusBasisPoints !== undefined
  if (hasFixed === hasShare) {
    throw new DomainValidationError(
      'INVALID_KPI',
      `kpiGroups[${index}]`,
      'must define exactly one of bonusKopecks or bonusBasisPoints',
    )
  }
  if (hasFixed) {
    assertMoney(group.bonusKopecks!, `kpiGroups[${index}].bonusKopecks`)
  } else {
    assertSafeInteger(
      group.bonusBasisPoints!,
      `kpiGroups[${index}].bonusBasisPoints`,
    )
  }
  const conditions = group.conditions.map((condition, conditionIndex) => {
    if (
      !['gte', 'gt', 'lte', 'lt', 'eq'].includes(condition.comparator) ||
      !condition.metric ||
      !Number.isFinite(condition.value)
    ) {
      throw new DomainValidationError(
        'INVALID_KPI',
        `kpiGroups[${index}].conditions[${conditionIndex}]`,
        'contains an invalid condition',
      )
    }
    return { ...condition }
  })
  return { ...group, conditions }
}

function selectTier(
  revenue: Money,
  target: Money,
  tiers: readonly BonusTier[],
): BonusTier | null {
  let selected: BonusTier | null = null
  for (const tier of tiers) {
    if (
      BigInt(revenue) * 100n >=
      BigInt(target) * BigInt(tier.thresholdPercent)
    ) {
      selected = tier
    }
  }
  return selected
}

function buildDistributionWeights(
  input: SalaryCalculationInput,
  salesRevenue: readonly Money[],
): readonly { readonly id: string; readonly weight: number }[] {
  if (input.distribution === 'equal') {
    return input.employees.map(({ id }) => ({ id, weight: 1 }))
  }
  if (input.distribution === 'weighted') {
    const weights = input.employees.map(({ id, weight }) => ({
      id,
      weight: weight ?? 1,
    }))
    return weights.some(({ weight }) => weight > 0)
      ? weights
      : input.employees.map(({ id }) => ({ id, weight: 1 }))
  }
  const revenueByEmployee: Record<string, Money> = Object.fromEntries(
    input.employees.map(({ id }) => [id, 0]),
  )
  input.sales.forEach((sale, index) => {
    if (sale.employeeId) {
      revenueByEmployee[sale.employeeId] = checkedAdd(
        revenueByEmployee[sale.employeeId]!,
        salesRevenue[index]!,
        `employeeRevenue.${sale.employeeId}`,
      )
    }
  })
  return Object.values(revenueByEmployee).some((revenue) => revenue > 0)
    ? input.employees.map(({ id }) => ({ id, weight: revenueByEmployee[id]! }))
    : input.employees.map(({ id }) => ({ id, weight: 1 }))
}

function calculateEmployee(
  employee: Employee,
  teamBonus: Money,
  groups: readonly KpiGroup[],
): EmployeeSalaryResult {
  const shiftSalary = employee.shifts
    ? multiplyRatio(
        employee.baseSalary,
        employee.shifts.worked,
        employee.shifts.planned,
        `employees.${employee.id}.shiftSalary`,
      )
    : employee.baseSalary
  const kpiGroups: KpiGroupResult[] = groups.map((group) => {
    const matches = group.conditions.map((condition) =>
      matchesCondition(employee.metrics?.[condition.metric], condition),
    )
    const passed =
      group.operator === 'AND' ? matches.every(Boolean) : matches.some(Boolean)
    return {
      groupId: group.id,
      passed,
      bonus: passed
        ? group.bonusKopecks !== undefined
          ? group.bonusKopecks
          : multiplyRatio(
              shiftSalary,
              group.bonusBasisPoints ?? 0,
              10_000,
              `employees.${employee.id}.kpi.${group.id}`,
            )
        : 0,
    }
  })
  const kpiBonus = sumMoney(
    kpiGroups.map((group) => group.bonus),
    `employees.${employee.id}.kpiBonus`,
  )
  const totalSalary = sumMoney(
    [shiftSalary, teamBonus, kpiBonus],
    `employees.${employee.id}.totalSalary`,
  )
  return {
    employeeId: employee.id,
    baseSalary: employee.baseSalary,
    shiftSalary,
    teamBonus,
    kpiBonus,
    totalSalary,
    kpiGroups,
  }
}

function matchesCondition(
  actual: number | undefined,
  condition: KpiCondition,
): boolean {
  if (actual === undefined) return false
  switch (condition.comparator) {
    case 'gte':
      return actual >= condition.value
    case 'gt':
      return actual > condition.value
    case 'lte':
      return actual <= condition.value
    case 'lt':
      return actual < condition.value
    case 'eq':
      return actual === condition.value
  }
}

function validateId(id: string, path: string): void {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new DomainValidationError('INVALID_NUMBER', path, 'must be non-empty')
  }
}

function ensureUniqueIds(
  entries: readonly { readonly id: string }[],
  path: string,
): void {
  const ids = new Set<string>()
  entries.forEach(({ id }, index) => {
    if (ids.has(id)) {
      throw new DomainValidationError(
        'DUPLICATE_ID',
        `${path}[${index}].id`,
        `duplicate id "${id}"`,
      )
    }
    ids.add(id)
  })
}

function byId(a: { readonly id: string }, b: { readonly id: string }): number {
  return a.id.localeCompare(b.id)
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreeze(nested)
  }
  return value
}

