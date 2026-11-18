import { getFirebaseConfig } from './auth'
import { albumIdPattern, inspectSecretImage, parseSecretAlbum, secretAlbumLimits, validAlbumName } from './secret-albums'
import type { SecretAlbumSummary } from './secret-albums'
import { validateProfileImage } from './profile-images'

function endpoint() {
  const value = import.meta.env.VITE_STORY_API_URL as string | undefined
  if (!value) throw new Error('비밀 앨범 서버가 아직 연결되지 않았어요.')
  const url = new URL(value)
  if (url.protocol !== 'https:' || !/^kirari-stories\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) || url.pathname !== '/stories' || url.search || url.hash || url.username || url.password || url.port) throw new Error('비밀 앨범 서버 주소를 확인해 주세요.')
  return `${url.origin}/secret-albums`
}
export async function secretAlbumRequest(path = '', body?: unknown): Promise<unknown> {
  const url = endpoint()
  if (path && !/^\/[a-f0-9-]{36}(?:\/(?:photos|delete))?$/.test(path)) throw new Error('앨범 주소를 확인해 주세요.')
  const headers: Record<string, string> = {}
  const config = getFirebaseConfig(import.meta.env)
  if (!config) throw new Error('Firebase 연결을 확인해 주세요.')
  const { getFirebaseAuth } = await import('./firebase')
  const auth = getFirebaseAuth(config)
  await auth.authStateReady()
  if (!auth.currentUser) throw new Error('관리자 로그인이 필요해요.')
  headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`
  const response = await fetch(`${url}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(90_000) })
  let data: unknown
  try {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('empty-response')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > secretAlbumLimits.archiveBytes + 64_000) { await reader.cancel(); throw new Error('oversized-response') }
        chunks.push(chunk.value)
      }
    } finally { reader.releaseLock() }
    data = JSON.parse(await new Blob(chunks as BlobPart[]).text())
  } catch { throw new Error('비밀 앨범 서버 연결을 확인해 주세요.') }
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '비밀 앨범을 처리하지 못했어요.'
    if (response.status === 404 && message === '글을 열 수 없어요.') throw new Error('비밀 앨범 서버가 아직 업데이트되지 않았어요. 서버 배포 후 다시 시도해 주세요.')
    throw new Error(message)
  }
  return data
}
export function readSecretSummary(value: unknown): SecretAlbumSummary {
  if (!value || typeof value !== 'object') throw new Error('앨범 정보를 확인해 주세요.')
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string' || !albumIdPattern.test(item.id) || !validAlbumName(item.name) || !Number.isSafeInteger(item.revision) || (item.revision as number) < 1) throw new Error('앨범 정보를 확인해 주세요.')
  return { id: item.id, name: item.name, revision: item.revision as number, editable: item.editable === true }
}
export async function listSecretAlbums() {
  const data = await secretAlbumRequest()
  if (!Array.isArray(data) || data.length > 100) throw new Error('앨범 목록을 확인해 주세요.')
  return data.map(readSecretSummary)
}
export async function openSecretAlbum(id: string) {
  if (!albumIdPattern.test(id)) throw new Error('앨범 주소를 확인해 주세요.')
  const data = await secretAlbumRequest(`/${id}`)
  const album = parseSecretAlbum(data)
  if (!album) throw new Error('앨범 정보를 확인해 주세요.')
  const photos = []
  // These bytes stay in memory. They never enter gallery.items, search, or browser storage.
  for (const photo of album.photos) {
    const bytes = Uint8Array.from(atob(photo.image), character => character.charCodeAt(0))
    inspectSecretImage(bytes, photo.mime)
    const blob = new Blob([bytes], { type: photo.mime })
    await validateProfileImage(blob)
    photos.push({ ...photo.metadata, id: photo.id, blob })
  }
  return { ...readSecretSummary(data), photos }
}
