export const LIKE_STORAGE_KEY = 'kirari.likes.v1'
export const DAILY_LIKE_LIMIT = 5
export type LikeCount = { version: 1, total: number, day: string, used: number }
type LikeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function emptyLikes(day: string): LikeCount {
  return { version: 1, total: 0, day, used: 0 }
}

export function readLikes(storage: LikeStorage, day: string): LikeCount {
  const raw = storage.getItem(LIKE_STORAGE_KEY)
  if (raw === null) return emptyLikes(day)
  if (raw.length > 256) throw new Error('Invalid like count')
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object') throw new Error('Invalid like count')
  const record = value as Record<string, unknown>
  if (record.version !== 1 || !Number.isSafeInteger(record.total) || (record.total as number) < 0
    || !Number.isInteger(record.used) || (record.used as number) < 0 || (record.used as number) > DAILY_LIKE_LIMIT
    || (record.total as number) < (record.used as number) || typeof record.day !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(record.day)) throw new Error('Invalid like count')
  const date = new Date(`${record.day}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== record.day) throw new Error('Invalid like date')
  return { version: 1, total: record.total as number, day, used: record.day === day ? record.used as number : 0 }
}

export function addLike(storage: LikeStorage, day: string): LikeCount {
  const current = readLikes(storage, day)
  if (current.used >= DAILY_LIKE_LIMIT || current.total === Number.MAX_SAFE_INTEGER) return current
  const next = { ...current, total: current.total + 1, used: current.used + 1 }
  storage.setItem(LIKE_STORAGE_KEY, JSON.stringify(next))
  return next
}

export function resetLikes(storage: LikeStorage, day: string): LikeCount {
  storage.removeItem(LIKE_STORAGE_KEY)
  return emptyLikes(day)
}
