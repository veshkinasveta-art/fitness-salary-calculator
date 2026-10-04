import { describe, expect, it } from 'vitest'
import {
  canClosePeriod,
  canEditOperations,
  canManageMembers,
  canReadStudio,
} from './roles.ts'

describe('studio roles', () => {
  it('lets every member read studio data', () => {
    expect(canReadStudio('viewer')).toBe(true)
    expect(canReadStudio('manager')).toBe(true)
    expect(canReadStudio('owner')).toBe(true)
  })

  it('keeps viewers read-only and owners in charge of invites', () => {
    expect(canEditOperations('viewer')).toBe(false)
    expect(canEditOperations('manager')).toBe(true)
    expect(canManageMembers('manager')).toBe(false)
    expect(canManageMembers('owner')).toBe(true)
  })

  it('forbids offline period closing', () => {
    expect(canClosePeriod('owner', false)).toBe(false)
    expect(canClosePeriod('owner', true)).toBe(true)
    expect(canClosePeriod('viewer', true)).toBe(false)
  })
})
