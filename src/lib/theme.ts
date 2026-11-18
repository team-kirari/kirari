export const THEME_KEY = 'kirari.theme'
export type Theme = 'blue' | 'pink' | 'monochrome'

function isTheme(value: unknown): value is Theme {
  return value === 'blue' || value === 'pink' || value === 'monochrome'
}

export function readTheme(storage: Pick<Storage, 'getItem'>): Theme {
  const value = storage.getItem(THEME_KEY)
  return isTheme(value) ? value : 'blue'
}

export function saveTheme(storage: Pick<Storage, 'setItem'>, value: Theme): void {
  if (!isTheme(value)) throw new Error('Invalid theme')
  storage.setItem(THEME_KEY, value)
}

export function resetTheme(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(THEME_KEY)
}
