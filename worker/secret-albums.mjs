import { Buffer } from 'node:buffer'
import { createStoryStore, StoryStoreConflict, STORY_REPO } from './story-store.mjs'
import { albumIdPattern, inspectSecretImage, parseSecretAlbum, secretAlbumLimits, validAlbumName } from '../src/lib/secret-albums.ts'
import { parsePhotoMetadata } from '../src/lib/gallery-catalog.ts'

const encode = value => new TextEncoder().encode(value)
class AlbumError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
const denied = () => new AlbumError(404, '앨범을 열 수 없어요.')
export function validSecretArchive(items) {
  return Array.isArray(items) && items.length <= secretAlbumLimits.albums && new Set(items.map(item => item?.id)).size === items.length
    && new Set(items.map(item => item?.name)).size === items.length && items.every(item => parseSecretAlbum(item)
      && typeof item.owner === 'string' && item.owner.length > 0 && item.owner.length <= 128
      && (item.passwordHash === undefined || typeof item.passwordHash === 'string' && /^[a-f0-9]{32}:[a-f0-9]{64}$/.test(item.passwordHash)))
}
// No public index, public assets, Actions dispatch, or Firestore writes exist on this path.
const summary = (album, uid) => ({ id: album.id, name: album.name, revision: album.revision, editable: album.owner === uid })
const withoutPasswords = items => items.map(item => {
  const record = { ...item }
  delete record.passwordHash
  return record
})
async function bodyJson(request, limit) {
  if (request.headers.get('Content-Type') !== 'application/json') throw new AlbumError(415, 'JSON 입력을 확인해 주세요.')
  const chunks = []
  let size = 0
  if (!request.body) throw new AlbumError(400, '입력을 확인해 주세요.')
  for await (const chunk of request.body) {
    size += chunk.byteLength
    if (size > limit) throw new AlbumError(413, '비밀 앨범 저장 용량을 초과했어요.')
    chunks.push(Buffer.from(chunk))
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new AlbumError(400, '입력을 확인해 주세요.') }
}
export async function handleSecretAlbums(request, env, fetcher, identity) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive', Vary: 'Origin', 'Content-Type': 'application/json' }
  const reply = (status, data) => new Response(JSON.stringify(data), { status, headers })
  const origin = request.headers.get('Origin')
  const local = /^http:\/\/(?:127\.0\.0\.1|localhost):5173$/.test(env.STORY_LOCAL_ORIGIN || '') ? env.STORY_LOCAL_ORIGIN : null
  if (!origin || origin !== 'https://team-kirari.github.io' && origin !== local) return reply(403, { error: '허용되지 않은 요청이에요.' })
  headers['Access-Control-Allow-Origin'] = origin
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } })
  try {
    if (!env.STORY_GITHUB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.FIREBASE_PROJECT_ID) throw new AlbumError(503, '비밀 앨범 서버 연결을 확인해 주세요.')
    const key = Buffer.from(await crypto.subtle.digest('SHA-256', encode(request.headers.get('CF-Connecting-IP') || 'unknown'))).toString('hex')
    if (!(await env.STORY_LIMITER.limit({ key })).success) throw new AlbumError(429, '잠시 후 다시 시도해 주세요.')
    const path = new URL(request.url)
    const route = /^\/secret-albums(?:\/([a-f0-9-]+)(?:\/(photos|delete))?)?$/.exec(path.pathname)
    if (!route || path.search || route[1] && !albumIdPattern.test(route[1])) throw denied()
    if (!['GET', 'POST'].includes(request.method) || request.method === 'GET' && route[2]) throw denied()
    // User-authorized shared admin albums: every read requires an active admin;
    // adding photos and deleting remain owner-only.
    const uid = await identity(request, env, fetcher)
    if (!uid) throw new AlbumError(401, '관리자 로그인이 필요해요.')
    const ghHeaders = { Authorization: `Bearer ${env.STORY_GITHUB_WRITE_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'kirari-secret-albums', 'Content-Type': 'application/json' }
    const store = createStoryStore((path, body, method = 'GET', raw = false) => fetcher(`${STORY_REPO}${path}`, { method, headers: { ...ghHeaders, ...(raw ? { Accept: 'application/vnd.github.raw+json' } : {}) }, signal: AbortSignal.timeout(20000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), {
      directory: 'web-secret-albums', archiveBytes: secretAlbumLimits.archiveBytes, rawArchive: true, validateArchive: validSecretArchive, commitMessage: 'Save private album',
      buildIndex: () => [], validateIndex: items => Array.isArray(items) && !items.length,
    })
    if (request.method === 'GET') {
      const items = await store.readArchive()
      if (!route[1]) return reply(200, items.map(album => summary(album, uid)))
      const album = items.find(item => item.id === route[1])
      if (!album) throw denied()
      return reply(200, { ...parseSecretAlbum(album), editable: album.owner === uid })
    }
    const input = await bodyJson(request, route[2] === 'photos' ? secretAlbumLimits.albumBytes + 64_000 : 2048)
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AlbumError(400, '입력을 확인해 주세요.')
    const snapshot = await store.snapshot()
    const items = snapshot.items
    let album
    if (!route[1]) {
      if (!albumIdPattern.test(input.id) || !validAlbumName(input.name)) throw new AlbumError(400, '앨범 이름을 1~80자로 입력해 주세요.')
      // Retrying the same create is safe without exposing another owner's album.
      const existing = items.find(item => item.id === input.id)
      if (existing) {
        if (existing.owner !== uid || existing.name !== input.name) throw denied()
        return reply(200, summary(existing, uid))
      }
      if (items.some(item => item.name === input.name)) throw new AlbumError(409, '다른 앨범 이름을 사용해 주세요.')
      album = { id: input.id, name: input.name, revision: 1, owner: uid, photos: [] }
    } else {
      const previous = items.find(item => item.id === route[1])
      if (!previous || previous.owner !== uid) throw denied()
      const retry = route[2] === 'photos' ? parseSecretAlbum({ ...previous, photos: input.photos }) : null
      if (retry?.photos.length && retry.photos.every(photo => previous.photos.some(existing => JSON.stringify(existing) === JSON.stringify(photo)))) return reply(200, summary(previous, uid))
      if (!Number.isSafeInteger(input.revision) || input.revision !== previous.revision) throw new AlbumError(409, '앨범이 변경됐어요. 업로드 창을 다시 열어 주세요.')
      album = { ...previous, revision: previous.revision + 1 }
      if (route[2] === 'delete') {
        await store.save(snapshot, withoutPasswords(items.filter(item => item.id !== album.id)))
        return reply(200, { deleted: true })
      } else if (route[2] === 'photos') {
        if (!Array.isArray(input.photos) || !input.photos.length || input.photos.length > secretAlbumLimits.photos) throw new AlbumError(400, '사진을 선택해 주세요.')
        const candidates = parseSecretAlbum({ ...album, photos: input.photos })
        if (!candidates) throw new AlbumError(400, '사진과 입력 정보를 확인해 주세요.')
        for (const photo of candidates.photos) {
          const bytes = Buffer.from(photo.image, 'base64')
          if (bytes.toString('base64') !== photo.image || !parsePhotoMetadata(photo.metadata)) throw new AlbumError(400, '사진 정보를 확인해 주세요.')
          try { inspectSecretImage(bytes, photo.mime) } catch { throw new AlbumError(400, '사진 형식·용량·크기를 확인해 주세요.') }
          const existing = album.photos.find(item => item.id === photo.id)
          if (existing && JSON.stringify(existing) !== JSON.stringify(photo)) throw new AlbumError(409, '사진이 변경됐어요. 다시 등록해 주세요.')
          if (!existing) album.photos = [...album.photos, photo]
        }
        if (!parseSecretAlbum(album)) throw new AlbumError(413, '앨범은 40장·이미지 데이터 12MB까지 저장할 수 있어요.')
      } else throw denied()
    }
    const next = withoutPasswords([...items.filter(item => item.id !== album.id), album])
    if (!validSecretArchive(next) || Buffer.byteLength(JSON.stringify(next)) > secretAlbumLimits.archiveBytes) throw new AlbumError(413, '비밀 앨범 전체 저장 한도를 초과했어요.')
    await store.save(snapshot, next)
    return reply(200, summary(album, uid))
  } catch (error) {
    if (error instanceof StoryStoreConflict) return reply(409, { error: '다른 저장과 겹쳤어요. 창을 다시 열어 주세요.' })
    // identity errors also use status; never include upstream errors or credentials.
    const status = [400, 401, 403, 404, 409, 413, 415, 429, 503].includes(error.status) ? error.status : 502
    return reply(status, { error: error instanceof AlbumError ? error.message : [401, 403].includes(status) ? '관리자 권한을 확인해 주세요.' : '비밀 앨범 서버에 연결하지 못했어요. 다시 시도해 주세요.' })
  }
}
