import { describe, expect, it } from 'vitest'
import { parseSpreadsheetId, spreadsheetUrl } from './googleSheet.ts'

describe('google sheet link', () => {
  it('accepts a full document URL and a raw id', () => {
    expect(
      parseSpreadsheetId(
        'https://docs.google.com/spreadsheets/d/1AbCDefGhIJKLmnopQRstuVWxyz0123456789/edit#gid=0',
      ),
    ).toBe('1AbCDefGhIJKLmnopQRstuVWxyz0123456789')
    expect(parseSpreadsheetId('1AbCDefGhIJKLmnopQRstuVWxyz0123456789')).toBe(
      '1AbCDefGhIJKLmnopQRstuVWxyz0123456789',
    )
  })

  it('rejects empty or invalid values', () => {
    expect(parseSpreadsheetId('https://docs.google.com/document/d/abc')).toBeNull()
    expect(parseSpreadsheetId('короткая')).toBeNull()
  })

  it('builds an editor URL', () => {
    expect(spreadsheetUrl('sheet-id')).toBe(
      'https://docs.google.com/spreadsheets/d/sheet-id/edit',
    )
  })
})
