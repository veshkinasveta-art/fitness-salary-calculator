import { describe, expect, it } from 'vitest'
import {
  DomainValidationError,
  calculateSalary,
  distributeLargestRemainder,
} from '../index.ts'
import type { SalaryCalculationInput } from '../index.ts'

function input(
  revenue: number,
  overrides: Partial<SalaryCalculationInput> = {},
): SalaryCalculationInput {
  return {
    employees: [{ id: 'manager', name: 'Manager', baseSalary: 50_000 }],
    products: [{ id: 'membership', name: 'Membership', price: revenue }],
    sales: [{ productId: 'membership', quantity: 1 }],
    revenueTarget: 100_000,
    ...overrides,
  }
}

describe('calculateSalary', () => {
  it.each([
    [79_999, null, 0],
    [80_000, 80, 2_400],
    [100_000, 100, 5_000],
  ])(
    'selects the tier at revenue %i',
    (revenue, threshold, expectedPool) => {
      const result = calculateSalary(input(revenue))
      expect(result.appliedTier?.thresholdPercent ?? null).toBe(threshold)
      expect(result.teamBonusPool).toBe(expectedPool)
    },
  )

  it('handles zero revenue', () => {
    const result = calculateSalary(
      input(1_000, { sales: [{ productId: 'membership', quantity: 0 }] }),
    )
    expect(result.revenue).toBe(0)
    expect(result.attainmentPercent).toBe(0)
    expect(result.teamBonusPool).toBe(0)
  })

  it('applies shift ratio and rounds to whole kopecks', () => {
    const result = calculateSalary(
      input(0, {
        employees: [
          {
            id: 'manager',
            name: 'Manager',
            baseSalary: 10_001,
            shifts: { worked: 1, planned: 2 },
          },
        ],
      }),
    )
    expect(result.employees[0]!.shiftSalary).toBe(5_001)
  })

  it('supports AND and OR KPI groups', () => {
    const result = calculateSalary(
      input(0, {
        employees: [
          {
            id: 'manager',
            name: 'Manager',
            baseSalary: 100_000,
            metrics: { conversion: 20, rating: 4.8 },
          },
        ],
        kpiGroups: [
          {
            id: 'quality',
            operator: 'AND',
            bonusBasisPoints: 1_000,
            conditions: [
              { metric: 'conversion', comparator: 'gte', value: 20 },
              { metric: 'rating', comparator: 'gt', value: 4.5 },
            ],
          },
          {
            id: 'stretch',
            operator: 'OR',
            bonusBasisPoints: 500,
            conditions: [
              { metric: 'conversion', comparator: 'gt', value: 99 },
              { metric: 'rating', comparator: 'eq', value: 4.8 },
            ],
          },
          {
            id: 'missed',
            operator: 'AND',
            bonusBasisPoints: 9_000,
            conditions: [{ metric: 'missing', comparator: 'gte', value: 1 }],
          },
        ],
      }),
    )
    expect(result.employees[0]!.kpiGroups.map(({ passed }) => passed)).toEqual([
      false,
      true,
      true,
    ])
    expect(result.employees[0]!.kpiBonus).toBe(15_000)
  })

  it('calculates any number of managers and all distribution modes', () => {
    const employees = [
      { id: 'a', name: 'A', baseSalary: 10_000, weight: 1 },
      { id: 'b', name: 'B', baseSalary: 10_000, weight: 3 },
      { id: 'c', name: 'C', baseSalary: 10_000, weight: 0 },
    ] as const
    const common = {
      employees,
      products: [{ id: 'p', name: 'P', price: 100 }],
      revenueTarget: 1,
      bonusTiers: [{ thresholdPercent: 0, bonusBasisPoints: 10_000 }],
    } as const
    const weighted = calculateSalary({
      ...common,
      distribution: 'weighted',
      sales: [{ productId: 'p', quantity: 1 }],
    })
    expect(weighted.employees.map(({ teamBonus }) => teamBonus)).toEqual([
      25, 75, 0,
    ])

    const proportional = calculateSalary({
      ...common,
      distribution: 'proportional',
      sales: [
        { productId: 'p', quantity: 1, employeeId: 'a' },
        { productId: 'p', quantity: 3, employeeId: 'b' },
      ],
    })
    expect(proportional.employees.map(({ teamBonus }) => teamBonus)).toEqual([
      100, 300, 0,
    ])
  })

  it('uses largest remainder with an exact invariant and stable tie-break', () => {
    const first = distributeLargestRemainder(2, [
      { id: 'c', weight: 1 },
      { id: 'a', weight: 1 },
      { id: 'b', weight: 1 },
    ])
    const permuted = distributeLargestRemainder(2, [
      { id: 'b', weight: 1 },
      { id: 'c', weight: 1 },
      { id: 'a', weight: 1 },
    ])
    expect(first).toEqual({ a: 1, b: 1, c: 0 })
    expect(permuted).toEqual(first)
    expect(Object.values(first).reduce((sum, value) => sum + value, 0)).toBe(2)
  })

  it.each<[number, DomainValidationError['code']]>([
    [-1, 'INVALID_MONEY'],
    [Number.MAX_SAFE_INTEGER + 1, 'INVALID_MONEY'],
  ])('rejects invalid money %s with a typed error', (baseSalary, code) => {
    expect(() =>
      calculateSalary(
        input(0, {
          employees: [{ id: 'x', name: 'X', baseSalary }],
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<DomainValidationError>>({
        name: 'DomainValidationError',
        code,
      }),
    )
  })

  it('detects arithmetic overflow', () => {
    expect(() =>
      calculateSalary({
        employees: [{ id: 'x', name: 'X', baseSalary: 0 }],
        products: [
          { id: 'p', name: 'P', price: Number.MAX_SAFE_INTEGER },
        ],
        sales: [{ productId: 'p', quantity: 2 }],
        revenueTarget: 1,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DomainValidationError>>({
        code: 'OVERFLOW',
      }),
    )
  })

  it('returns a detached deeply immutable snapshot', () => {
    const source = input(80_000)
    const snapshot = calculateSalary(source)
    ;(source.employees[0] as { name: string }).name = 'Changed'

    expect(snapshot.input.employees[0]!.name).toBe('Manager')
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.input.employees[0]!.metrics)).toBe(true)
    expect(() => {
      ;(snapshot.employees[0] as { totalSalary: number }).totalSalary = 0
    }).toThrow(TypeError)
  })
})

