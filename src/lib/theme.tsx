import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { ThemeBackdrop } from '../components/ThemeBackdrop.tsx'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ThemePalette = 'classic' | 'rose'

interface ThemeContextValue {
  preference: ThemePreference
  palette: ThemePalette
  resolved: 'light' | 'dark'
  setPreference: (value: ThemePreference) => void
  setPalette: (value: ThemePalette) => void
}

const THEME_KEY = 'salary-studio-theme'
const PALETTE_KEY = 'salary-studio-palette'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function readPalette(): ThemePalette {
  const stored = localStorage.getItem(PALETTE_KEY)
  return stored === 'classic' || stored === 'rose' ? stored : 'rose'
}

function themeColor(palette: ThemePalette, resolved: 'light' | 'dark') {
  if (palette === 'rose') return resolved === 'dark' ? '#2a1b22' : '#f8eef2'
  return resolved === 'dark' ? '#0f1512' : '#f3f6f2'
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'dark' || stored === 'light' ? stored : 'system'
  })
  const [palette, setPaletteState] = useState<ThemePalette>(readPalette)
  const [systemTheme, setSystemTheme] = useState(getSystemTheme)
  const resolved = preference === 'system' ? systemTheme : preference

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemTheme(media.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.documentElement.dataset.palette = palette
    document.documentElement.style.colorScheme = resolved
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', themeColor(palette, resolved))
  }, [palette, resolved])

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      palette,
      resolved,
      setPreference: (next) => {
        setPreferenceState(next)
        localStorage.setItem(THEME_KEY, next)
      },
      setPalette: (next) => {
        setPaletteState(next)
        localStorage.setItem(PALETTE_KEY, next)
      },
    }),
    [palette, preference, resolved],
  )

  return (
    <ThemeContext.Provider value={value}>
      <ThemeBackdrop />
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }
  return context
}
