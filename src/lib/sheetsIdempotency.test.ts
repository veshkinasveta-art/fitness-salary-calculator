import { describe, expect, it } from 'vitest'
import { resolveSheetRowIndex, shouldWriteRevision } from './sheetsIdempotency.ts'

describe('google sheets mirror', () => {
  it('updates the same entity_id instead of appending a duplicate', () => {
    expect(resolveSheetRowIndex(['a', 'b', 'c'], 'b')).toBe(1)
    expect(resolveSheetRowIndex(['a', 'b', 'c'], 'missing')).toBe(-1)
  })

  it('ignores a stale retry with a lower revision', () => {
    expect(
      shouldWriteRevision(
        { entityId: 'emp-1', revision: 4 },
        { entityId: 'emp-1', revision: 3 },
      ),
    ).toBe(false)
    expect(
      shouldWriteRevision(
        { entityId: 'emp-1', revision: 4 },
        { entityId: 'emp-1', revision: 4 },
      ),
    ).toBe(true)
  })
})
