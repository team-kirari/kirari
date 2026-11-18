import { isStoryDate } from './stories.ts'
import { logMediaUrl, parseTrpgLog } from './trpg-logs.ts'
import type { ParsedLog } from './trpg-logs.ts'
import type { ReplayEvent } from './trpg-replay.ts'

export const LOG_METADATA_VERSION = 2

export type LogMetadata = { logDate: string | null, preview: string | null }
export type LogSummary = LogMetadata & { id: string, title: string, editable: boolean }
const koreaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' })

// Restrict thumbnails to the image policy, including rejecting audio data URLs.
export function logPreviewUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2_000_000 || /^data:(?!image\/)/i.test(value)) return ''
  return logMediaUrl(value)
}

export function logMetadata(parsed: ParsedLog): LogMetadata {
  let logDate: string | null = null
  for (const message of parsed.replay.messages) {
    const timestamp = message.timestamp
    if (typeof timestamp !== 'string' || timestamp.length > 100) continue
    // Roll20's timestamps omit the timezone; interpret them in the site's Korean timezone.
    const iso = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)
    let day = iso && isStoryDate(timestamp.slice(0, 10)) && Number.isFinite(Date.parse(timestamp)) ? koreaDate.format(new Date(timestamp)) : ''
    const roll20 = /^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4}) \d{1,2}:\d{2}\s?(?:AM|PM)$/i.exec(timestamp)
    if (roll20) {
      const month = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(roll20[1].toLowerCase()) + 1
      day = `${roll20[3]}-${String(month).padStart(2, '0')}-${roll20[2].padStart(2, '0')}`
    }
    if (isStoryDate(day) && (!logDate || day < logDate)) logDate = day
  }
  // Inspect the first slot only. An empty opening foreground uses the opening
  // background; do not scan forward to a later scene to find a nonempty image.
  const source = (event?: ReplayEvent) => {
    if (!event || event.status === 'clear' || event.imageUrl === 'ccfolia:none'
      || event.imageSize && (!event.imageSize.width || !event.imageSize.height)) return ''
    return logMediaUrl(parsed.replay.assets[event.assetId ?? '']?.src || event.imageSrc || event.imageUrl, parsed.replay.assets)
  }
  const firstForeground = parsed.replay.events.find(event => event.layer === 'foreground')
  const foreground = source(firstForeground)
  const background = source(parsed.replay.events.find(event => event.layer === 'background' && event.position <= (firstForeground?.position ?? 0)))
  const preview = logPreviewUrl(foreground || background) || null
  return { logDate, preview }
}

export function metadataFromLog(source: string): LogMetadata {
  return logMetadata(parseTrpgLog(source))
}

export function validLogMetadata(value: LogMetadata): boolean {
  return (value.logDate === null || isStoryDate(value.logDate))
    && (value.preview === null || typeof value.preview === 'string' && !!logPreviewUrl(value.preview))
}

export function compareLogs(a: { id: string, logDate: string | null }, b: { id: string, logDate: string | null }): number {
  return (b.logDate ?? '').localeCompare(a.logDate ?? '') || a.id.localeCompare(b.id)
}
