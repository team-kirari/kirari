import { getFirebaseConfig } from './auth'
import { compareStories, isStoryDate, parseStoryDraft } from './stories'
import type { Story, StorySummary } from './stories'

const remoteUrl = import.meta.env.VITE_STORY_API_URL as string | undefined
export const remote = Boolean(remoteUrl)
function storyEndpoint() {
  if (!remoteUrl) {
    if (!import.meta.env.DEV) throw new Error('이야기 서버가 아직 연결되지 않았어요.')
    return `${import.meta.env.BASE_URL}__local/stories`
  }
  const url = new URL(remoteUrl)
  if (url.protocol !== 'https:' || !/^kirari-stories\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) || url.pathname !== '/stories' || url.search || url.hash || url.username || url.password || url.port) throw new Error('이야기 서버 주소를 확인해 주세요.')
  return url.href
}
export async function request(path = '', body?: unknown, authenticated = false): Promise<unknown> {
  const endpoint = storyEndpoint()
  const headers: Record<string, string> = remote ? {} : { 'X-Kirari-Local': '1' }
  if (remote && authenticated) {
    const config = getFirebaseConfig(import.meta.env)
    if (!config) throw new Error('Firebase 연결을 확인해 주세요.')
    const { getFirebaseAuth } = await import('./firebase')
    const auth = getFirebaseAuth(config)
    await auth.authStateReady()
    if (!auth.currentUser) throw new Error('관리자 로그인이 필요해요.')
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`
  }
  const response = await fetch(`${endpoint}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', redirect: 'error',
    signal: AbortSignal.timeout(remote ? 60_000 : 15_000),
  })
  const data: unknown = await response.json()
  if (!response.ok) throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '글을 불러오지 못했어요.')
  return data
}
export function readStory(data: unknown): Story {
  if (!data || typeof data !== 'object') throw new Error('글의 형식을 확인해 주세요.')
  const item = data as Record<string, unknown>
  const draft = parseStoryDraft(item)
  if (!draft || typeof item.id !== 'string' || !/^[a-f0-9-]{36}$/.test(item.id)
    || typeof item.revision !== 'number' || !Number.isSafeInteger(item.revision) || item.revision < 1
    || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt))
    || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))
    || typeof item.protected !== 'boolean') throw new Error('글의 형식을 확인해 주세요.')
  return { ...draft, id: item.id, revision: item.revision, createdAt: item.createdAt, updatedAt: item.updatedAt, protected: item.protected, editable: item.editable === true }
}
export async function readList(admin = false): Promise<StorySummary[]> {
  const data = await request('', undefined, admin)
  if (!Array.isArray(data) || data.length > 1000 || data.some(item => !item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[a-f0-9-]{36}$/.test(item.id) || typeof item.title !== 'string' || item.title.length > 120 || typeof item.author !== 'string' || item.author.length > 60 || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt)) || (item.writtenOn !== undefined && !isStoryDate(item.writtenOn)) || (item.createdAt !== undefined && (typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)))) || typeof item.protected !== 'boolean')) throw new Error('이야기 목록의 형식을 확인해 주세요.')
  return data.map(item => ({ ...item, createdAt: item.createdAt ?? item.updatedAt })).sort(compareStories)
}

