export type TimelineEvent = {
  id: string
  year: number
  month: number
  day: number
  dateLabel: string
  title: string
  body: string
  revision: number
  deleted: boolean
}

export function parseTimelineEvent(id: string, value: unknown): TimelineEvent | null {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id) || !value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if (Object.keys(data).sort().join(',') !== 'body,dateLabel,day,deleted,month,revision,title,year'
    || !Number.isInteger(data.year) || Number(data.year) < 1 || Number(data.year) > 9999
    || !Number.isInteger(data.month) || Number(data.month) < 1 || Number(data.month) > 12
    || !Number.isInteger(data.day) || Number(data.day) < 0 || Number(data.day) > 31
    || !Number.isSafeInteger(data.revision) || Number(data.revision) < 1
    || typeof data.deleted !== 'boolean'
    || typeof data.dateLabel !== 'string' || data.dateLabel.length > 80
    || typeof data.title !== 'string' || !data.title.trim() || data.title.length > 120
    || typeof data.body !== 'string' || !data.body.trim() || data.body.length > 12000) return null
  const year = Number(data.year), month = Number(data.month), day = Number(data.day)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  if (day > [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]) return null
  return { id, year, month, day, dateLabel: data.dateLabel, title: data.title, body: data.body, revision: Number(data.revision), deleted: data.deleted }
}

export function visibleTimeline(events: TimelineEvent[]): TimelineEvent[] {
  return events.filter(item => !item.deleted).sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day || a.id.localeCompare(b.id))
}

// Only standalone subtitle lines are recognized. All content remains React text.
export function timelineBodyBlocks(body: string) {
  return body.split(/\n\s*\n/).flatMap(paragraph => paragraph.split(/^(## [^\n]+)\r?$/m)
    .filter(text => text.trim()).map(text => ({ subtitle: text.startsWith('## '), text: text.startsWith('## ') ? text.slice(3).trim() : text.trim() })))
}

export function timelineReadError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
  const reason = code === 'permission-denied'
    ? 'Firebase가 타임라인 읽기를 거부했어요. 운영 환경에 timeline 공개 읽기용 firestore.rules가 적용됐는지 확인해 주세요.'
    : code === 'invalid-data' ? '저장된 사건 데이터의 형식이 올바르지 않아요. 관리자 확인이 필요합니다.'
    : code === 'unavailable' ? '네트워크 또는 Firebase에 연결할 수 없어요.'
    : 'Firebase 연결 설정이나 서비스 상태를 확인해 주세요.'
  return reason + ' 타임라인을 불러오지 못했어요. 연결이 복구되면 다시 표시합니다.'
}
