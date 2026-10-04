import { DomainValidationError } from './types.ts'
import type { Money } from './types.ts'

export function assertMoney(value: number, path = 'money'): asserts value is Money {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainValidationError(
      'INVALID_MONEY',
      path,
      'must be a non-negative safe integer amount in kopecks',
    )
  }
}

export function assertSafeInteger(
  value: number,
  path: string,
  minimum = 0,
): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new DomainValidationError(
      'INVALID_NUMBER',
      path,
      `must be a safe integer greater than or equal to ${minimum}`,
    )
  }
}

export function checkedAdd(a: Money, b: Money, path = 'money'): Money {
  assertMoney(a, path)
  assertMoney(b, path)
  const result = a + b
  if (!Number.isSafeInteger(result)) {
    throw new DomainValidationError('OVERFLOW', path, 'safe integer overflow')
  }
  return result
}

export function checkedMultiply(
  value: number,
  multiplier: number,
  path = 'money',
): Money {
  assertMoney(value, path)
  assertSafeInteger(multiplier, path)
  return toSafeMoney(BigInt(value) * BigInt(multiplier), path)
}

/** Multiplies money by a rational number, rounding halves upward. */
export function multiplyRatio(
  value: Money,
  numerator: number,
  denominator: number,
  path = 'money',
): Money {
  assertMoney(value, path)
  assertSafeInteger(numerator, path)
  assertSafeInteger(denominator, path, 1)
  const n = BigInt(value) * BigInt(numerator)
  const d = BigInt(denominator)
  return toSafeMoney((n + d / 2n) / d, path)
}

export function sumMoney(values: readonly Money[], path = 'money'): Money {
  return values.reduce((total, value) => checkedAdd(total, value, path), 0)
}

export interface AllocationWeight {
  readonly id: string
  readonly weight: number
}

/**
 * Hamilton/largest-remainder apportionment. Ties are resolved by id, so the
 * result does not depend on the input order.
 */
export function distributeLargestRemainder(
  amount: Money,
  entries: readonly AllocationWeight[],
  path = 'distribution',
): Readonly<Record<string, Money>> {
  assertMoney(amount, path)
  const seen = new Set<string>()
  for (const [index, entry] of entries.entries()) {
    if (!entry.id || seen.has(entry.id)) {
      throw new DomainValidationError(
        'DUPLICATE_ID',
        `${path}[${index}].id`,
        'must be non-empty and unique',
      )
    }
    seen.add(entry.id)
    assertSafeInteger(entry.weight, `${path}[${index}].weight`)
  }

  const result: Record<string, Money> = Object.fromEntries(
    entries.map(({ id }) => [id, 0]),
  )
  if (amount === 0 || entries.length === 0) return Object.freeze(result)

  const totalWeight = entries.reduce(
    (total, { weight }) => total + BigInt(weight),
    0n,
  )
  if (totalWeight === 0n) return Object.freeze(result)

  const shares = entries.map(({ id, weight }) => {
    const numerator = BigInt(amount) * BigInt(weight)
    return {
      id,
      floor: numerator / totalWeight,
      remainder: numerator % totalWeight,
    }
  })
  let assigned = shares.reduce((total, share) => total + share.floor, 0n)
  const ranked = [...shares].sort(
    (a, b) =>
      (a.remainder === b.remainder
        ? a.id.localeCompare(b.id)
        : a.remainder > b.remainder
          ? -1
          : 1),
  )

  for (const share of shares) result[share.id] = Number(share.floor)
  for (let index = 0; assigned < BigInt(amount); index += 1, assigned += 1n) {
    const id = ranked[index]!.id
    result[id] = checkedAdd(result[id]!, 1, path)
  }
  return Object.freeze(result)
}

function toSafeMoney(value: bigint, path: string): Money {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainValidationError('OVERFLOW', path, 'safe integer overflow')
  }
  return Number(value)
}

