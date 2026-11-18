export const STORY_DEFAULT_FONT_SIZE = 18
export const storySizePresets = [
  { value: 16, label: '작게' },
  { value: STORY_DEFAULT_FONT_SIZE, label: '중간' },
  { value: 22, label: '크게' },
]
export function storyPresetSize(size = STORY_DEFAULT_FONT_SIZE): number {
  return storySizePresets.reduce((nearest, preset) => Math.abs(preset.value - size) < Math.abs(nearest - size) ? preset.value : nearest, STORY_DEFAULT_FONT_SIZE)
}
// Keep accepting legacy saved sizes so existing archives and drafts remain readable.
export const storyFontSizes = Array.from({ length: 21 }, (_, index) => index + 12)
export const storyFonts = {
  default: { label: '사이트 기본', family: 'var(--font-sans)' },
  paperlogy: { label: '페이퍼로지', family: "'Kirari Paperlogy', var(--font-sans)", face: 'Kirari Paperlogy' },
  'ownglyph-corncorn': { label: '온글잎 콘콘체', family: "'Kirari Ownglyph Corncorn', var(--font-sans)", face: 'Kirari Ownglyph Corncorn' },
  'ridi-batang': { label: '리디바탕체', family: "'Kirari RIDIBatang', var(--font-sans)", face: 'Kirari RIDIBatang' },
  'chosun-myeongjo': { label: '조선일보명조체', family: "'Kirari Chosun Myeongjo', var(--font-sans)", face: 'Kirari Chosun Myeongjo' },
  galmuri14: { label: '갈무리14', family: "'Kirari Galmuri14', var(--font-sans)", face: 'Kirari Galmuri14' },
} as const
export type StoryFont = keyof typeof storyFonts
export type StoryDraft = { title: string, author: string, body: string, font: StoryFont, fontSize?: number, writtenOn?: string }
export type Story = StoryDraft & { id: string, revision: number, createdAt: string, updatedAt: string, protected: boolean, editable?: boolean }
export type StorySummary = Pick<Story, 'id' | 'title' | 'author' | 'createdAt' | 'updatedAt' | 'writtenOn' | 'protected' | 'editable'>
export type StoryBlock = { kind: 'paragraph', text: string } | { kind: 'scene' }

export function isStoryFont(value: unknown): value is StoryFont {
  return typeof value === 'string' && Object.hasOwn(storyFonts, value)
}

// Date-only values keep the selected calendar day independent of browser timezone.
export function isStoryDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && value >= '0001-01-01' && value <= '9999-12-31'
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

export function storyDate(story: { writtenOn?: string, createdAt?: string, updatedAt: string }): string {
  return story.writtenOn ?? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(story.createdAt ?? story.updatedAt))
}

export function compareStories(a: StorySummary, b: StorySummary): number {
  return storyDate(b).localeCompare(storyDate(a)) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
}

export function parseStoryDraft(value: unknown): StoryDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  const font = data.font === 'serif' || data.font === 'sans' ? 'default' : data.font
  if (data.fontSize !== undefined && (typeof data.fontSize !== 'number' || !storyFontSizes.includes(data.fontSize))) return null
  if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 120
    || typeof data.author !== 'string' || data.author.length > 60
    || typeof data.body !== 'string' || !data.body.trim()
    || !isStoryFont(font) || data.writtenOn !== undefined && !isStoryDate(data.writtenOn)) return null
  return { title: data.title.trim(), author: data.author.trim(), body: data.body.replace(/\r\n?/g, '\n'), font, ...(data.fontSize === undefined ? {} : { fontSize: data.fontSize as number }), ...(data.writtenOn === undefined ? {} : { writtenOn: data.writtenOn as string }) }
}

// Plain text only. A standalone *** line becomes a semantic scene separator.
export function storyBlocks(body: string): StoryBlock[] {
  const blocks: StoryBlock[] = []
  let lines: string[] = []
  function flush() {
    if (lines.length) blocks.push({ kind: 'paragraph', text: lines.join('\n') })
    lines = []
  }
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.trim() === '***') { flush(); blocks.push({ kind: 'scene' }) }
    else if (!line.trim()) flush()
    else lines.push(line)
  }
  flush()
  return blocks
}
