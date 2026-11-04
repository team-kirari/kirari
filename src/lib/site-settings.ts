import type { DDay } from './dday'
import { dDayLabel } from './dday.ts'

export const widgetIds = ['kenji', 'kiyo', 'date', 'dday', 'heart', 'messages', 'photo', 'player', 'story', 'guest'] as const
export type SiteSettings = {
  hero: 'portrait' | 'pair'
  feather: number
  ddays: DDay[]
  positions: Record<string, { x: number, y: number }>
  revision: number
}
export const defaultSettings: SiteSettings = { hero: 'portrait', feather: 0, ddays: [{ id: 'first', title: 'D-day', date: '' }], positions: {}, revision: 0 }

// Arrays preserve the stacking order; Firestore map key ordering does not.
export function encodeSettings(settings: SiteSettings) {
  return { ...settings, positions: Object.entries(settings.positions).map(([id, offset]) => ({ id, ...offset })) }
}

export function parseSettings(value: unknown): SiteSettings | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if (Object.keys(data).sort().join(',') !== 'ddays,feather,hero,positions,revision'
    || !['portrait', 'pair'].includes(data.hero as string)
    || !Number.isInteger(data.feather) || Number(data.feather) < 0 || Number(data.feather) > 40
    || !Number.isSafeInteger(data.revision) || Number(data.revision) < 0
    || !Array.isArray(data.ddays) || data.ddays.length > 10
    || !Array.isArray(data.positions) || data.positions.length > widgetIds.length) return null
  const ids = new Set<string>()
  const ddays: DDay[] = []
  for (const item of data.ddays) {
    if (!item || typeof item !== 'object' || Object.keys(item).sort().join(',') !== 'date,id,title') return null
    const { id, title, date } = item
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(id) || ids.has(id)
      || typeof title !== 'string' || title.length > 40
      || typeof date !== 'string' || (date !== '' && (date.startsWith('0000-') || !dDayLabel(date, '2000-01-01')))) return null
    ids.add(id)
    ddays.push({ id, title, date })
  }
  const positions: SiteSettings['positions'] = {}
  for (const item of data.positions) {
    if (!item || typeof item !== 'object' || Object.keys(item).sort().join(',') !== 'id,x,y') return null
    const { id, x, y } = item
    if (!widgetIds.includes(id) || Object.hasOwn(positions, id)
      || typeof x !== 'number' || !Number.isFinite(x) || Math.abs(x) > 4000
      || typeof y !== 'number' || !Number.isFinite(y) || Math.abs(y) > 4000) return null
    positions[id] = { x, y }
  }
  return { hero: data.hero as SiteSettings['hero'], feather: Number(data.feather), ddays, positions, revision: Number(data.revision) }
}
