import { describe, expect, it } from 'vitest'
import {
  assertMoney,
  checkedAdd,
  checkedMultiply,
  distributeLargestRemainder,
  multiplyRatio,
} from './money.ts'
import { DomainValidationError } from './types.ts'

describe('money arithmetic', () => {
  it('rejects float money amounts', () => {
    expect(() => assertMoney(10.5, 'value')).toThrow(DomainValidationError)
  })

  it('adds and multiplies only safe integers', () => {
    expect(checkedAdd(199, 1, 'sum')).toBe(200)
    expect(checkedMultiply(250_000, 3, 'product')).toBe(750_000)
    expect(() =>
      checkedAdd(Number.MAX_SAFE_INTEGER, 1, 'overflow'),
    ).toThrowError(/overflow/)
  })

  it('rounds half away from zero for ratios', () => {
    expect(multiplyRatio(100, 1, 3, 'ratio')).toBe(33)
    expect(multiplyRatio(100, 1, 2, 'half')).toBe(50)
  })

  it('distributes the largest remainder independently of input order', () => {
    const left = distributeLargestRemainder(
      100,
      [
        { id: 'b', weight: 1 },
        { id: 'a', weight: 1 },
        { id: 'c', weight: 1 },
      ],
      'fund',
    )
    const right = distributeLargestRemainder(
      100,
      [
        { id: 'c', weight: 1 },
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1 },
      ],
      'fund',
    )
    expect(left).toEqual({ a: 34, b: 33, c: 33 })
    expect(right).toEqual(left)
    expect(left.a + left.b + left.c).toBe(100)
  })
})
