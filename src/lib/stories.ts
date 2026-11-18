export const STORY_MAX_LENGTH = 100_000
export const storyFonts = {
  default: { label: '사이트 기본', family: 'var(--font-sans)' },
  paperlogy: { label: '페이퍼로지', family: "'Kirari Paperlogy', var(--font-sans)", face: 'Kirari Paperlogy' },
  'ownglyph-corncorn': { label: '온글잎 콘콘체', family: "'Kirari Ownglyph Corncorn', var(--font-sans)", face: 'Kirari Ownglyph Corncorn' },
  'ridi-batang': { label: '리디바탕체', family: "'Kirari RIDIBatang', var(--font-sans)", face: 'Kirari RIDIBatang' },
  'chosun-myeongjo': { label: '조선일보명조체', family: "'Kirari Chosun Myeongjo', var(--font-sans)", face: 'Kirari Chosun Myeongjo' },
  galmuri14: { label: '갈무리14', family: "'Kirari Galmuri14', var(--font-sans)", face: 'Kirari Galmuri14' },
  // Keep existing stored font IDs readable.
  serif: { label: '시스템 명조', family: "'Batang', '바탕', 'AppleMyungjo', serif" },
  sans: { label: '시스템 고딕', family: "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif" },
} as const
export type StoryFont = keyof typeof storyFonts
export type StoryDraft = { title: string, author: string, body: string, font: StoryFont }
export type Story = StoryDraft & { id: string, revision: number, createdAt: string, updatedAt: string, protected: boolean, editable?: boolean }
export type StorySummary = Pick<Story, 'id' | 'title' | 'author' | 'updatedAt' | 'protected' | 'editable'>
export type StoryBlock = { kind: 'paragraph', text: string } | { kind: 'scene' }

export function isStoryFont(value: unknown): value is StoryFont {
  return typeof value === 'string' && Object.hasOwn(storyFonts, value)
}

export function parseStoryDraft(value: unknown): StoryDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 120
    || typeof data.author !== 'string' || data.author.length > 60
    || typeof data.body !== 'string' || !data.body.trim() || data.body.length > STORY_MAX_LENGTH
    || !isStoryFont(data.font)) return null
  return { title: data.title.trim(), author: data.author.trim(), body: data.body.replace(/\r\n?/g, '\n'), font: data.font }
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
