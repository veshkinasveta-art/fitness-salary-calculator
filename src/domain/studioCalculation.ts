import type {
  EmployeeInput,
  EmployeeResult,
  Product,
  StudioSettings,
  TeamResult,
} from '../app/model.ts'
import { checkedMultiply } from './money.ts'
import { calculateSalary } from './salaryCalculator.ts'
import type { SalaryCalculationInput, SalaryCalculationSnapshot } from './types.ts'

export function toDomainInput(
  employees: readonly EmployeeInput[],
  products: readonly Product[],
  settings: StudioSettings,
): SalaryCalculationInput {
  return {
    employees: employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      baseSalary: checkedMultiply(
        settings.shiftCostKopecks,
        employee.shifts,
        `employees.${employee.id}.baseSalary`,
      ),
      weight: employee.weight,
      metrics: {
        trials: employee.trials,
        memberships: Object.values(employee.sales).reduce(
          (sum, quantity) => sum + Math.max(0, quantity),
          0,
        ),
      },
    })),
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      price: product.priceKopecks,
    })),
    sales: employees.flatMap((employee) =>
      products.map((product) => ({
        productId: product.id,
        employeeId: employee.id,
        quantity: employee.sales[product.id] ?? 0,
      })),
    ),
    revenueTarget: settings.teamPlanKopecks,
    bonusTiers: settings.bonusTiers.map((tier) => ({
      thresholdPercent: tier.thresholdPercent,
      fundKopecks: tier.fundKopecks,
    })),
    distribution: settings.distribution,
    kpiGroups: [
      {
        id: 'studio-kpi',
        operator: 'AND',
        bonusKopecks: settings.kpiAmountKopecks,
        conditions: [
          {
            metric: 'trials',
            comparator: 'gte',
            value: settings.kpiTrials,
          },
          {
            metric: 'memberships',
            comparator: 'gte',
            value: settings.kpiMemberships,
          },
        ],
      },
    ],
  }
}

export function calculateStudioPeriod(
  employees: readonly EmployeeInput[],
  products: readonly Product[],
  settings: StudioSettings,
): { snapshot: SalaryCalculationSnapshot; result: TeamResult } {
  const snapshot = calculateSalary(toDomainInput(employees, products, settings))
  return { snapshot, result: toTeamResult(snapshot, employees, products) }
}

export function toTeamResult(
  snapshot: SalaryCalculationSnapshot,
  employees: readonly EmployeeInput[],
  products: readonly Product[],
): TeamResult {
  const revenues = employees.map((employee) =>
    products.reduce(
      (sum, product) =>
        sum + Math.max(0, employee.sales[product.id] ?? 0) * product.priceKopecks,
      0,
    ),
  )
  const totalRevenueKopecks = snapshot.revenue
  const employeeResults: EmployeeResult[] = employees.map((employee, index) => {
    const calculated = snapshot.employees.find(
      (item) => item.employeeId === employee.id,
    )
    const memberships = Object.values(employee.sales).reduce(
      (sum, quantity) => sum + Math.max(0, quantity),
      0,
    )
    return {
      employeeId: employee.id,
      revenueKopecks: revenues[index] ?? 0,
      revenueShare:
        totalRevenueKopecks > 0
          ? ((revenues[index] ?? 0) * 100) / totalRevenueKopecks
          : 0,
      shiftsPayKopecks: calculated?.shiftSalary ?? 0,
      teamBonusKopecks: calculated?.teamBonus ?? 0,
      kpiBonusKopecks: calculated?.kpiBonus ?? 0,
      salaryKopecks: calculated?.totalSalary ?? 0,
      memberships,
      kpiReached: calculated?.kpiGroups.some((group) => group.passed) ?? false,
    }
  })

  return {
    totalRevenueKopecks,
    totalSalaryKopecks: employeeResults.reduce(
      (sum, employee) => sum + employee.salaryKopecks,
      0,
    ),
    completionPercent: snapshot.attainmentPercent,
    bonusFundKopecks: snapshot.teamBonusPool,
    employees: employeeResults,
  }
}
