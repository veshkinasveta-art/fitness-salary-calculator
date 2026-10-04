import { describe, expect, it } from 'vitest'
import { defaultProducts, defaultSettings } from '../app/demoData.ts'
import type { EmployeeInput } from '../app/model.ts'
import { calculateSalary } from './salaryCalculator.ts'
import { calculateStudioPeriod } from './studioCalculation.ts'
import { DomainValidationError } from './types.ts'

const productIds = {
  p8: defaultProducts[0]!.id,
  p12: defaultProducts[1]!.id,
  p128: defaultProducts[6]!.id,
}

const emptySales = Object.fromEntries(defaultProducts.map((product) => [product.id, 0]))

const employees: EmployeeInput[] = [
  {
    id: 'elena',
    name: 'Елена',
    role: 'Менеджер',
    color: 'sage',
    shifts: 10,
    trials: 20,
    weight: 1,
    sales: { ...emptySales, [productIds.p8]: 3, [productIds.p12]: 2 },
  },
  {
    id: 'maria',
    name: 'Мария',
    role: 'Менеджер',
    color: 'amber',
    shifts: 8,
    trials: 4,
    weight: 1,
    sales: { ...emptySales, [productIds.p8]: 1 },
  },
]

describe('studio salary engine', () => {
  it('pays no team bonus below 80% of the plan', () => {
    const { result } = calculateStudioPeriod(
      employees,
      defaultProducts,
      defaultSettings,
    )
    expect(result.totalRevenueKopecks).toBe(2_100_000)
    expect(result.completionPercent).toBeLessThan(80)
    expect(result.bonusFundKopecks).toBe(0)
  })

  it('unlocks a 40 000 ₽ fund from 80% and a 60 000 ₽ fund from 100%', () => {
    const mid = calculateStudioPeriod(
      [
        {
          ...employees[0]!,
          sales: { ...emptySales, [productIds.p128]: 20 },
        },
        {
          ...employees[1]!,
          sales: emptySales,
        },
      ],
      defaultProducts,
      defaultSettings,
    )
    expect(mid.result.totalRevenueKopecks).toBe(64_000_000)
    expect(mid.result.bonusFundKopecks).toBe(4_000_000)

    const high = calculateStudioPeriod(
      [
        {
          ...employees[0]!,
          sales: { ...emptySales, [productIds.p128]: 26 },
        },
        employees[1]!,
      ],
      defaultProducts,
      defaultSettings,
    )
    expect(high.result.totalRevenueKopecks).toBeGreaterThanOrEqual(80_000_000)
    expect(high.result.bonusFundKopecks).toBe(6_000_000)
  })

  it('awards a fixed KPI bonus only when both conditions pass', () => {
    const { result } = calculateStudioPeriod(
      employees,
      defaultProducts,
      defaultSettings,
    )
    const elena = result.employees.find((item) => item.employeeId === 'elena')
    const maria = result.employees.find((item) => item.employeeId === 'maria')
    expect(elena?.memberships).toBe(5)
    expect(elena?.kpiReached).toBe(true)
    expect(elena?.kpiBonusKopecks).toBe(1_000_000)
    expect(maria?.kpiReached).toBe(false)
    expect(maria?.kpiBonusKopecks).toBe(0)
  })

  it('pays shifts as an integer rate and keeps zero revenue valid', () => {
    const empty: EmployeeInput[] = employees.map((employee) => ({
      ...employee,
      shifts: 0,
      trials: 0,
      sales: emptySales,
    }))
    const { result } = calculateStudioPeriod(
      empty,
      defaultProducts,
      defaultSettings,
    )
    expect(result.totalRevenueKopecks).toBe(0)
    expect(result.totalSalaryKopecks).toBe(0)
    expect(result.bonusFundKopecks).toBe(0)
  })

  it('splits a remainder across N employees without losing kopecks', () => {
    const many = Array.from({ length: 7 }, (_, index) => ({
      ...employees[0]!,
      id: `emp-${index}`,
      name: `Сотрудник ${index + 1}`,
      sales: { ...emptySales, [productIds.p8]: index + 1 },
    }))
    const settings = {
      ...defaultSettings,
      teamPlanKopecks: 1_000_000,
      bonusTiers: [{ thresholdPercent: 80, fundKopecks: 100 }],
      kpiAmountKopecks: 0,
    }
    const { result, snapshot } = calculateStudioPeriod(
      many,
      defaultProducts,
      settings,
    )
    const distributed = result.employees.reduce(
      (sum, employee) => sum + employee.teamBonusKopecks,
      0,
    )
    expect(distributed).toBe(100)
    expect(snapshot.distributedTeamBonus).toBe(100)
    expect(Object.isFrozen(snapshot)).toBe(true)
  })

  it('rejects unknown products and float money', () => {
    expect(() =>
      calculateSalary({
        employees: [{ id: 'a', name: 'A', baseSalary: 100 }],
        products: [{ id: 'p', name: 'P', price: 10.5 }],
        sales: [],
        revenueTarget: 100,
        bonusTiers: [{ thresholdPercent: 100, fundKopecks: 0 }],
      }),
    ).toThrow(DomainValidationError)

    expect(() =>
      calculateSalary({
        employees: [{ id: 'a', name: 'A', baseSalary: 100 }],
        products: [{ id: 'p', name: 'P', price: 100 }],
        sales: [{ productId: 'missing', quantity: 1, employeeId: 'a' }],
        revenueTarget: 100,
        bonusTiers: [{ thresholdPercent: 100, fundKopecks: 0 }],
      }),
    ).toThrow(/unknown product/)
  })
})
