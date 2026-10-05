import { afterEach, describe, expect, it } from 'vitest'
import { defaultSettings } from '../app/demoData.ts'
import {
  STUDIO_PREFS_KEY,
  mergeProducts,
  mergeStudioSettings,
  resolveSpreadsheetId,
  writeStoredSpreadsheetId,
} from './studioPrefs.ts'

afterEach(() => {
  localStorage.removeItem(STUDIO_PREFS_KEY)
})

describe('studio prefs merge', () => {
  it('keeps the previous spreadsheet id when the incoming value is empty', () => {
    const merged = mergeStudioSettings(
      { ...defaultSettings, googleSpreadsheetId: 'kept-sheet-id-1234567890' },
      { studioName: 'Новая студия', googleSpreadsheetId: '' },
    )
    expect(merged.studioName).toBe('Новая студия')
    expect(merged.googleSpreadsheetId).toBe('kept-sheet-id-1234567890')
  })

  it('replaces the id when a new table is chosen', () => {
    writeStoredSpreadsheetId('old-sheet-id-1234567890')
    const merged = mergeStudioSettings(
      { ...defaultSettings, googleSpreadsheetId: 'old-sheet-id-1234567890' },
      { googleSpreadsheetId: 'new-sheet-id-1234567890' },
    )
    expect(merged.googleSpreadsheetId).toBe('new-sheet-id-1234567890')
  })

  it('restores an id from localStorage if memory lost it', () => {
    writeStoredSpreadsheetId('stored-sheet-id-1234567890')
    const merged = mergeStudioSettings(defaultSettings, {})
    expect(merged.googleSpreadsheetId).toBe('stored-sheet-id-1234567890')
    expect(resolveSpreadsheetId('', undefined, null)).toBeUndefined()
  })

  it('does not drop product prices on an empty incoming list', () => {
    const current = [
      {
        id: 'p1',
        name: '8',
        trainings: 8,
        priceKopecks: 333_000,
        active: true,
      },
    ]
    expect(mergeProducts(current, []).map((item) => item.priceKopecks)).toEqual([
      333_000,
    ])
    expect(
      mergeProducts(current, [{ ...current[0]!, priceKopecks: 350_000 }])[0]
        ?.priceKopecks,
    ).toBe(350_000)
  })
})
