export const LIKE_STORAGE_KEY = 'kirari.likes.v1'
export const DAILY_LIKE_LIMIT = 5
export type LikeCount = { version: 2, day: string, used: number }
type LikeStorage = Pick<Storage, 'getItem' | 'setItem'>

export function likeLoadErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  switch (code) {
    case 'likes/configuration-missing':
      return 'Firebase 설정을 읽지 못했어요. 개발 서버를 종료하고 npm run dev로 다시 실행해 주세요.'
    case 'permission-denied':
      return '좋아요 읽기 권한이 거부됐어요. 연결한 Firebase 프로젝트의 (default) 데이터베이스에서 규칙을 게시했는지 확인해 주세요. (permission-denied)'
    case 'not-found':
      return '연결한 Firebase 프로젝트에 (default) Firestore 데이터베이스가 있는지 확인해 주세요. (not-found)'
    case 'unavailable':
    case 'deadline-exceeded':
      return 'Firebase에 연결하지 못했어요. 인터넷 연결과 브라우저의 요청 차단 설정을 확인한 뒤 새로고침해 주세요.'
    case 'resource-exhausted':
      return 'Firebase 사용 한도에 도달했어요. 잠시 후 다시 확인해 주세요. (resource-exhausted)'
    default:
      return '좋아요를 불러오지 못했어요. 새로고침 후에도 반복되면 개발자 도구의 Firebase 오류 코드를 확인해 주세요.'
  }
}

export function emptyLikes(day: string): LikeCount {
  return { version: 2, day, used: 0 }
}

export function parseLikeTotal(value: unknown): number {
  if (value === undefined) return 0
  if (!value || typeof value !== 'object' || !('total' in value)
    || !Number.isSafeInteger(value.total) || (value.total as number) < 0) throw new Error('Invalid remote like count')
  return value.total as number
}

export function readLikes(storage: LikeStorage, day: string): LikeCount {
  const raw = storage.getItem(LIKE_STORAGE_KEY)
  if (raw === null) return emptyLikes(day)
  if (raw.length > 256) throw new Error('Invalid like count')
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object') throw new Error('Invalid like count')
  const record = value as Record<string, unknown>
  if ((record.version !== 1 && record.version !== 2)
    || !Number.isInteger(record.used) || (record.used as number) < 0 || (record.used as number) > DAILY_LIKE_LIMIT
    || typeof record.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.day)) throw new Error('Invalid like count')
  if (record.version === 1 && (!Number.isSafeInteger(record.total)
    || (record.total as number) < (record.used as number))) throw new Error('Invalid legacy like count')
  const date = new Date(`${record.day}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== record.day) throw new Error('Invalid like date')
  return { version: 2, day, used: record.day === day ? record.used as number : 0 }
}

export async function addLike(storage: LikeStorage, day: string, increment: () => Promise<void>) {
  const current = readLikes(storage, day)
  if (current.used >= DAILY_LIKE_LIMIT) return { count: current, added: false, storageFailed: false }
  // Confirm storage is writable before issuing a remote write.
  storage.setItem(LIKE_STORAGE_KEY, JSON.stringify(current))
  await increment()
  const count = { ...current, used: current.used + 1 }
  try {
    storage.setItem(LIKE_STORAGE_KEY, JSON.stringify(count))
    return { count, added: true, storageFailed: false }
  } catch {
    // The server already counted this click. Never automatically submit it again.
    return { count, added: true, storageFailed: true }
  }
}
