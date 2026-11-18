import { getFirebaseConfig } from './auth'
import { parseStoryDraft } from './stories'
import type { Story } from './stories'
import { parseTrpgLog } from './trpg-logs'
import { readTrpgLogResponse } from './trpg-log-response'
import { compareLogs, validLogMetadata } from './trpg-log-summary'
import type { LogSummary } from './trpg-log-summary'

export type { LogSummary } from './trpg-log-summary'
const configured = import.meta.env.VITE_STORY_API_URL as string | undefined
export const remoteLogs = Boolean(configured)
function endpoint() {
  if (!configured) {
    if (!import.meta.env.DEV) throw new Error('로그 서버가 아직 연결되지 않았어요.')
    return `${import.meta.env.BASE_URL}__local/trpg-logs`
  }
  const url = new URL(configured)
  if (url.protocol !== 'https:' || !/^kirari-stories\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) || url.pathname !== '/stories' || url.search || url.hash || url.username || url.password || url.port) throw new Error('로그 서버 주소를 확인해 주세요.')
  url.pathname = '/logs'
  return url.href
}
async function request(path: string, body?: unknown, admin = false): Promise<unknown> {
  const headers: Record<string, string> = remoteLogs ? {} : { 'X-Kirari-Local': '1' }
  if (admin && !remoteLogs) headers['X-Kirari-Local-Author'] = '1'
  if (admin && remoteLogs) {
    const config = getFirebaseConfig(import.meta.env)
    if (!config) throw new Error('Firebase 연결을 확인해 주세요.')
    const { getFirebaseAuth } = await import('./firebase')
    const auth = getFirebaseAuth(config)
    await auth.authStateReady()
    if (!auth.currentUser) throw new Error('관리자 로그인이 필요해요.')
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`
  }
  const response = await fetch(`${endpoint()}${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(60_000) })
  return readTrpgLogResponse(response, path === '' && body === undefined, path.endsWith('/unlock'))
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value)
export async function listTrpgLogs(admin: boolean): Promise<LogSummary[]> {
  const value = await request('', undefined, admin)
  if (!Array.isArray(value) || value.some(item => !item || !uuid(item.id) || typeof item.title !== 'string' || item.title.length > 120 || typeof item.editable !== 'boolean')) throw new Error('로그 목록 형식을 확인해 주세요.')
  if (value.some(item => !Object.hasOwn(item, 'logDate') || !Object.hasOwn(item, 'preview'))) throw new Error('로그 서버 업데이트가 필요해요. 날짜와 첫 전경 정보를 아직 반환하지 않고 있어요.')
  return value.map(({ id, title, editable, logDate, preview }) => {
    const metadata = { logDate, preview }
    if (!validLogMetadata(metadata)) throw new Error('로그 미리보기 형식을 확인해 주세요.')
    return { id, title, editable, ...metadata }
  }).sort(compareLogs)
}
function readLog(value: unknown): Story {
  if (!value || typeof value !== 'object') throw new Error('로그 형식을 확인해 주세요.')
  const data = value as Record<string, unknown>
  const draft = parseStoryDraft(value)
  if (!draft || !uuid(data.id) || !Number.isSafeInteger(data.revision) || Number(data.revision) < 1 || typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt)) || typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt)) || data.protected !== true) throw new Error('로그 형식을 확인해 주세요.')
  parseTrpgLog(draft.body)
  return { ...draft, id: data.id, revision: Number(data.revision), createdAt: data.createdAt, updatedAt: data.updatedAt, protected: true, editable: data.editable === true }
}
export async function unlockTrpgLog(id: string, password: string): Promise<Story> {
  if (!uuid(id)) throw new Error('로그 주소를 확인해 주세요.')
  return readLog(await request(`/${id}/unlock`, { password }))
}
export async function editTrpgLog(id: string): Promise<Story> {
  if (!uuid(id)) throw new Error('로그 주소를 확인해 주세요.')
  return readLog(await request(`/${id}/edit`, undefined, true))
}
export async function saveTrpgLog(input: { title: string, body: string, password: string | null, id?: string, revision?: number, mutation: string }): Promise<Story> {
  const { id, revision, ...rest } = input
  return readLog(await request('', { ...rest, ...(remoteLogs ? { id: id ?? crypto.randomUUID(), revision: revision ?? 0 } : id ? { id, revision } : {}), author: '', font: 'default' }, true))
}
