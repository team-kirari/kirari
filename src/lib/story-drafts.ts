import { isStoryDate, isStoryFont, storyFontSizes } from './stories.ts'
import type { StoryDraft } from './stories.ts'

export type StoryDraftBackup = { draft: StoryDraft, protect: boolean, revision: number, savedAt: string }
export type StoryDraftBackups = { auto: StoryDraftBackup | null, slots: (StoryDraftBackup | null)[] }
export const emptyStoryBackups = (): StoryDraftBackups => ({ auto: null, slots: [null, null, null] })
export const storyDraftKey = (remote: boolean, id?: string) => `kirari:story-drafts:v1:${remote ? 'remote' : 'local'}:${id ?? 'new'}`

// Unlike published stories, unfinished drafts may have empty fields. Copy only approved fields.
function parseBackup(value: unknown): StoryDraftBackup | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  if (!data.draft || typeof data.draft !== 'object' || Array.isArray(data.draft)) return null
  const draft = data.draft as Record<string, unknown>
  if (typeof draft.title !== 'string' || draft.title.length > 120
    || typeof draft.author !== 'string' || draft.author.length > 60
    || typeof draft.body !== 'string'
    || !isStoryFont(draft.font)
    || draft.fontSize !== undefined && (typeof draft.fontSize !== 'number' || !storyFontSizes.includes(draft.fontSize))
    || draft.writtenOn !== undefined && draft.writtenOn !== '' && !isStoryDate(draft.writtenOn)
    || typeof data.protect !== 'boolean'
    || typeof data.revision !== 'number' || !Number.isSafeInteger(data.revision) || data.revision < 0
    || typeof data.savedAt !== 'string' || !Number.isFinite(Date.parse(data.savedAt))) return null
  return {
    draft: { title: draft.title, author: draft.author, body: draft.body, font: draft.font,
      ...(draft.fontSize === undefined ? {} : { fontSize: draft.fontSize as number }),
      ...(draft.writtenOn === undefined ? {} : { writtenOn: draft.writtenOn as string }) },
    protect: data.protect, revision: data.revision, savedAt: data.savedAt,
  }
}

export function readStoryBackups(storage: Pick<Storage, 'getItem'>, key: string): StoryDraftBackups {
  const raw = storage.getItem(key)
  if (raw === null) return emptyStoryBackups()
  if (raw.length > 2_500_000) throw new Error('Invalid draft storage')
  const data = JSON.parse(raw)
  if (!data || data.version !== 1 || !Array.isArray(data.slots) || data.slots.length !== 3) throw new Error('Invalid draft storage')
  const auto = data.auto === null ? null : parseBackup(data.auto)
  const slots = data.slots.map((slot: unknown) => slot === null ? null : parseBackup(slot))
  if (data.auto !== null && !auto || slots.some((slot: StoryDraftBackup | null, index: number) => data.slots[index] !== null && !slot)) throw new Error('Invalid draft storage')
  return { auto, slots }
}

export function writeStoryBackups(storage: Pick<Storage, 'setItem'>, key: string, backups: StoryDraftBackups) {
  const clean = (backup: StoryDraftBackup | null) => {
    if (backup === null) return null
    const parsed = parseBackup(backup)
    if (!parsed) throw new Error('Invalid draft')
    return parsed
  }
  if (backups.slots.length !== 3) throw new Error('Invalid draft slots')
  const serialized = JSON.stringify({ version: 1, auto: clean(backups.auto), slots: backups.slots.map(clean) })
  if (serialized.length > 2_500_000) throw new Error('Draft storage capacity exceeded')
  storage.setItem(key, serialized)
}
