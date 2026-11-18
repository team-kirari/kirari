import { logMediaUrl } from './trpg-media.ts'
import { buildReplaySteps } from './trpg-replay.ts'
import type { CinematicReplay, ReplayStep, RichNode } from './trpg-replay.ts'
export { logMediaUrl } from './trpg-media.ts'
export function logIdFromHash(hash: string): string | null {
  return /^#trpg\?log=([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/.exec(hash)?.[1] ?? null
}
export type LogLine = { id: number, sourceId?: number, speaker: string, text: string, channel: string, narration: boolean, visible: boolean, portrait: string, background: string, foreground: string, content?: RichNode[], color?: string, scene?: ReplayStep['state'], sceneOnly?: boolean, image?: { src: string, alt: string } }
export type ParsedLog = { format: '시네마틱', entries: LogLine[], hasMedia: boolean, playback: LogLine[], replay: CinematicReplay }
// Keep individual lines intact for scene playback and scroll-based music updates.
export function groupLogEntries(entries: LogLine[]): LogLine[][] {
  const groups: LogLine[][] = []
  for (const entry of entries) {
    const group = groups.at(-1)
    const previous = group?.at(-1)
    if (previous && entry.id === previous.id + 1 && entry.speaker === previous.speaker
      && entry.portrait === previous.portrait && entry.channel === previous.channel
      && entry.narration === previous.narration) group!.push(entry)
    else groups.push([entry])
  }
  return groups
}
const invalid = () => new Error('시네마틱 내보내기 HTML 파일을 확인해 주세요. 지원 형식은 rollscene-studio-project-v1이에요.')
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid()
  return value as Record<string, unknown>
}
function string(value: unknown, max = Infinity): string {
  if (value === undefined) return ''
  if (typeof value !== 'string' || value.length > max) throw invalid()
  return value
}
function richText(value: unknown): string {
  if (!Array.isArray(value)) throw invalid()
  const parts: string[] = []
  const stack: [unknown, number][] = value.slice().reverse().map(item => [item, 0])
  while (stack.length) {
    const [item, depth] = stack.pop()!
    if (depth > 30) throw invalid()
    if (typeof item === 'string') { parts.push(string(item)); continue }
    const node = record(item)
    if (['script', 'style', 'iframe', 'object'].includes(String(node.tag))) continue
    if (['br', 'p', 'div', 'tr', 'li'].includes(String(node.tag))) parts.push('\n')
    if (node.text !== undefined) parts.push(string(node.text))
    if (node.children !== undefined) {
      if (!Array.isArray(node.children)) throw invalid()
      stack.push(...node.children.slice().reverse().map(child => [child, depth + 1] as [unknown, number]))
    }
  }
  const result = parts.join('').trim()
  return result
}
// Separate photographs from dialogue without serializing uploaded content as HTML.
export function splitLogContent(nodes: RichNode[], assets: Record<string, unknown>): { content?: RichNode[], image?: { src: string, alt: string } }[] {
  type Part = { content?: RichNode[], image?: { src: string, alt: string } }
  const join = (parts: Part[]) => parts.reduce<Part[]>((result, part) => {
    const previous = result.at(-1)
    if (previous?.content && part.content) previous.content.push(...part.content)
    else result.push(part)
    return result
  }, [])
  const visit = (node: RichNode, depth: number): Part[] => {
    if (depth > 30) return []
    if (typeof node === 'string') return [{ content: [node] }]
    if (['script', 'style', 'iframe', 'object'].includes(String(node.tag))) return []
    if (node.tag === 'img') {
      const src = logMediaUrl(node.src, assets)
      return src ? [{ image: { src, alt: typeof node.alt === 'string' ? node.alt : '로그 이미지' } }] : []
    }
    if (node.tag === 'table' || /chat-roll/.test(node.className ?? '')) return [{ content: [node] }]
    if (!node.children) return [{ content: [node] }]
    const parts = join([...(node.text ? [{ content: [node.text] }] : []), ...node.children.flatMap(child => visit(child, depth + 1))])
    return parts.map(part => part.image ? part : { content: [{ ...node, text: undefined, children: part.content }] })
  }
  return join(nodes.flatMap(node => visit(node, 0))).filter(part => part.image || richText(part.content).trim())
}
export function parseTrpgLog(source: string): ParsedLog {
  const encoded = source.match(/\bconst\s+B64\s*=\s*(['"])([A-Za-z0-9+/=\s]+)\1\s*;/)?.[2]
  if (!encoded) throw invalid()
  let data: Record<string, unknown>
  try {
    const bytes = Uint8Array.from(atob(encoded.replace(/\s/g, '')), character => character.charCodeAt(0))
    data = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
  } catch { throw invalid() }
  if (data.format !== 'rollscene-studio-project-v1' || !Array.isArray(data.messages) || !data.messages.length || !Array.isArray(data.events)) throw invalid()
  const assets = data.assets === undefined ? {} : record(data.assets)
  const settings = data.settings === undefined ? {} : record(data.settings)
  const visibility = data.tabVisibility === undefined ? {} : record(data.tabVisibility)
  if (Object.values(visibility).some(value => typeof value !== 'boolean')) throw invalid()
  const narrators = settings.narrators === undefined ? ['Narrator', '나레이션', '나레이터', 'Narration'] : settings.narrators
  if (!Array.isArray(narrators) || narrators.length > 100 || narrators.some(value => typeof value !== 'string' || value.length > 200)) throw invalid()
  // Older exports use null for absent asset references (especially clear events).
  const events = data.events.map(item => Object.fromEntries(Object.entries(record(item)).filter(([, value]) => value !== null))).sort((a, b) => Number(a.position) - Number(b.position) || Number(a.sequence) - Number(b.sequence))
  if (events.some(event => typeof event.position !== 'number' || !Number.isSafeInteger(event.position) || event.position < 0 || event.position > (data.messages as unknown[]).length || typeof event.sequence !== 'number' || !Number.isFinite(event.sequence) || !['background', 'foreground', 'fieldObjects', 'bgm'].includes(String(event.layer)))) throw invalid()
  let background = '', foreground = '', cursor = 0, hasMedia = false
  const entries = data.messages.map((item, id): LogLine => {
    const message = record(item)
    while (cursor < events.length && Number(events[cursor].position) <= id) {
      const event = events[cursor++]
      if (event.layer === 'background') background = logMediaUrl(event.imageSrc ?? event.imageUrl ?? (event.assetId ? `asset:${event.assetId}` : ''), assets)
      if (event.layer === 'foreground') foreground = logMediaUrl(event.imageSrc ?? event.imageUrl ?? (event.assetId ? `asset:${event.assetId}` : ''), assets)
      hasMedia = true
    }
    const speaker = string(message.speaker, 200).trim()
    const channel = string(message.tab, 100).trim() || 'main'
    const body = message.content === undefined ? string(message.body) : richText(message.content)
    if (message.narration !== undefined && typeof message.narration !== 'boolean') throw invalid()
    const portrait = logMediaUrl(message.portrait, assets)
    if (portrait) hasMedia = true
    return { id, speaker, content: message.content as RichNode[] | undefined, color: typeof message.color === 'string' && /^#[a-f0-9]{3,8}$/i.test(message.color) ? message.color : undefined, text: body, channel, portrait, background, foreground,
      narration: message.narration === true || !speaker || narrators.some(name => name.trim().toLowerCase() === speaker.toLowerCase()),
      visible: Object.hasOwn(visibility, channel) ? visibility[channel] === true : !/^(잡담|ooc|out of character|비밀|귓말)$/i.test(channel) }
  })
  const replay = { ...data, events, assets, settings, tabVisibility: visibility } as unknown as CinematicReplay
  for (const event of replay.events) {
    if (event.layer === 'fieldObjects' && (!Array.isArray(event.objects) || event.objects.some(object => !object || typeof object.id !== 'string' || typeof object.imageUrl !== 'string' || ![object.x, object.y, object.width, object.height, object.rotation, object.zIndex].every(Number.isFinite)))) throw invalid()
    if (event.bounds && ![event.bounds.x, event.bounds.y, event.bounds.width, event.bounds.height].every(Number.isFinite)) throw invalid()
    if (event.imageSize && ![event.imageSize.width, event.imageSize.height].every(Number.isFinite)) throw invalid()
    for (const key of ['imageUrl', 'imageSrc', 'assetId', 'audioUrl', 'audioAssetId', 'youtubeUrl', 'audioName', 'status', 'channel'] as const) if (event[key] !== undefined && typeof event[key] !== 'string') throw invalid()
    if (event.volume !== undefined && (typeof event.volume !== 'number' || !Number.isFinite(event.volume))) throw invalid()
    if (event.loop !== undefined && typeof event.loop !== 'boolean') throw invalid()
  }
  if (settings.cameraZoom !== undefined && (typeof settings.cameraZoom !== 'number' || !Number.isFinite(settings.cameraZoom))) throw invalid()
  if (settings.showFieldObjects !== undefined && typeof settings.showFieldObjects !== 'boolean') throw invalid()
  const steps = buildReplaySteps(replay)
  const playback = steps.flatMap((step): LogLine[] => {
    const original = step.messageIndex === undefined ? undefined : entries[step.messageIndex]
    if (original) Object.assign(original, { scene: step.state, background: step.state.background, foreground: step.state.foreground })
    const line: LogLine = { ...(original ?? { id: 0, speaker: '', text: '', channel: 'scene', narration: true, visible: true, portrait: '' }), sourceId: original?.id, background: step.state.background, foreground: step.state.foreground, scene: step.state, sceneOnly: !original }
    if (!original?.content) return [line]
    const parts = splitLogContent(original.content, assets)
    return parts.length ? parts.map(part => ({ ...line, ...part, content: part.content, text: part.image ? '' : richText(part.content), portrait: part.image ? '' : line.portrait })) : [line]
  })
  const seen = new Set<number>()
  playback.forEach((line, index) => {
    line.id = line.sourceId !== undefined && !seen.has(line.sourceId) ? line.sourceId : -index - 1
    if (line.sourceId !== undefined) seen.add(line.sourceId)
  })
  return { format: '시네마틱', entries, hasMedia, playback, replay }
}
export function validateLogFile(file: { name: string, size: number, type: string }): void {
  if (!/\.html?$/i.test(file.name) || !['', 'text/html'].includes(file.type) || !Number.isSafeInteger(file.size) || file.size <= 0) throw invalid()
}
