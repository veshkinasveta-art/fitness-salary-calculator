import { describe, expect, it } from 'vitest'
import { defaultEmployees, defaultProducts, defaultSettings, demoHistory } from '../app/demoData.ts'
import { createBackup, parseBackup } from './backup.ts'

describe('backup import/export', () => {
  it('round-trips a versioned snapshot', () => {
    const backup = createBackup({
      settings: defaultSettings,
      employees: defaultEmployees,
      products: defaultProducts,
      history: demoHistory,
      month: '2026-10',
    })
    expect(backup.schemaVersion).toBe(1)
    expect(parseBackup(backup).employees).toHaveLength(2)
  })

  it('rejects float money and unknown schema versions', () => {
    expect(() =>
      parseBackup({
        schemaVersion: 1,
        exportedAt: '2026-10-04T00:00:00.000Z',
        settings: { ...defaultSettings, teamPlanKopecks: 10.5 },
        employees: defaultEmployees,
        history: [],
      }),
    ).toThrow()
    expect(() =>
      parseBackup({
        schemaVersion: 99,
        exportedAt: '2026-10-04T00:00:00.000Z',
        settings: defaultSettings,
        employees: defaultEmployees,
        history: [],
      }),
    ).toThrow()
  })
})
