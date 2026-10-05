import type { Product, StudioSettings } from '../app/model.ts'

export const STUDIO_PREFS_KEY = 'salary-studio-prefs'

export function resolveSpreadsheetId(
  ...candidates: Array<string | undefined | null>
): string | undefined {
  for (const value of candidates) {
    const id = value?.trim()
    if (id) return id
  }
  return undefined
}

export function readStoredSpreadsheetId(): string | undefined {
  try {
    const raw = localStorage.getItem(STUDIO_PREFS_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { googleSpreadsheetId?: unknown }
    return resolveSpreadsheetId(
      typeof parsed.googleSpreadsheetId === 'string'
        ? parsed.googleSpreadsheetId
        : undefined,
    )
  } catch {
    return undefined
  }
}

export function writeStoredSpreadsheetId(id: string | undefined): void {
  const next = resolveSpreadsheetId(id)
  if (!next) return
  localStorage.setItem(
    STUDIO_PREFS_KEY,
    JSON.stringify({ googleSpreadsheetId: next }),
  )
}

export function mergeStudioSettings(
  current: StudioSettings,
  incoming: Partial<StudioSettings> = {},
  storedId?: string,
): StudioSettings {
  const merged = { ...current, ...incoming }
  const googleSpreadsheetId = resolveSpreadsheetId(
    incoming.googleSpreadsheetId,
    current.googleSpreadsheetId,
    storedId,
    readStoredSpreadsheetId(),
  )
  return googleSpreadsheetId
    ? { ...merged, googleSpreadsheetId }
    : merged
}

export function pickDefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([, item]) => item !== undefined && item !== '',
    ),
  ) as Partial<T>
}

export function mergeProducts(
  current: readonly Product[],
  incoming: readonly Product[] | undefined,
): Product[] {
  if (!incoming || incoming.length === 0) return [...current]
  const currentById = new Map(current.map((product) => [product.id, product]))
  return incoming.map((product) => {
    const previous = currentById.get(product.id)
    const priceKopecks =
      Number.isSafeInteger(product.priceKopecks) && product.priceKopecks >= 0
        ? product.priceKopecks
        : (previous?.priceKopecks ?? 0)
    return { ...previous, ...product, priceKopecks }
  })
}
