import { describe, expect, it } from 'vitest'

describe('theme persistence keys', () => {
  it('stores palette separately from light/dark preference', () => {
    localStorage.setItem('salary-studio-theme', 'dark')
    localStorage.setItem('salary-studio-palette', 'classic')
    expect(localStorage.getItem('salary-studio-theme')).toBe('dark')
    expect(localStorage.getItem('salary-studio-palette')).toBe('classic')
    localStorage.setItem('salary-studio-palette', 'rose')
    expect(localStorage.getItem('salary-studio-theme')).toBe('dark')
    expect(localStorage.getItem('salary-studio-palette')).toBe('rose')
  })
})
