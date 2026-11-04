export type Character = 'kenji' | 'kiyo'
export type MessageWriter = { uid: string, character: Character }
export type PublicMessage = { id: string, character: Character, text: string, createdAt: number }
export const MESSAGE_LIMIT = 30
export const MESSAGE_MAX_LENGTH = 180
export const characterNames = { kenji: '켄지', kiyo: '키요' }

export function parseCharacter(value: unknown): Character | null {
  return value === 'kenji' || value === 'kiyo' ? value : null
}

export function messageText(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > MESSAGE_MAX_LENGTH) return null
  return value.trim()
}

export function parsePublicMessage(id: string, value: unknown): PublicMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  const character = parseCharacter(data.character)
  const text = messageText(data.text)
  if (Object.keys(data).sort().join(',') !== 'character,createdAt,text'
    || !character || !text || typeof data.createdAt !== 'number'
    || !Number.isFinite(data.createdAt) || data.createdAt < 0) return null
  return { id, character, text, createdAt: data.createdAt }
}
