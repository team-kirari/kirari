export const GUEST_LIMIT = 30
export const GUEST_MAX_LENGTH = 180
export type GuestNote = { id: string, text: string, createdAt: number }

export function guestText(value: unknown): string | null {
  return typeof value === 'string' && value.length <= GUEST_MAX_LENGTH && value.trim() ? value.trim() : null
}

export function parseGuestNote(id: string, value: unknown): GuestNote | null {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9]{20}$/.test(id) || !value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  const text = guestText(data.text)
  if (Object.keys(data).sort().join(',') !== 'createdAt,text' || !text
    || typeof data.createdAt !== 'number' || !Number.isFinite(data.createdAt)
    || data.createdAt < 0 || data.createdAt > 253402300799999) return null
  return { id, text, createdAt: data.createdAt }
}
