import { handleUpload } from './index.mjs'
import { Buffer } from 'node:buffer'
import { compareStories, parseStoryDraft } from '../src/lib/stories.ts'
import { buildStoryIndex, createStoryStore, StoryStoreConflict, STORY_REPO, validArchive } from './story-store.mjs'
import { parseTrpgLog } from '../src/lib/trpg-logs.ts'
import { compareLogs, LOG_METADATA_VERSION } from '../src/lib/trpg-log-summary.ts'
import { buildLogIndex, validLogIndex } from './log-index.mjs'
import { handleSecretAlbums } from './secret-albums.mjs'

const ORIGIN = 'https://team-kirari.github.io'
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/
const MAX_BYTES = 900_000
const encode = value => new TextEncoder().encode(value)
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
const denied = () => new ApiError(404, '글을 열 수 없어요.')
async function bounded(request, maxBytes = 500_000) {
  if (!request.body) throw new ApiError(400, '입력을 확인해 주세요.')
  let length = 0
  const chunks = []
  for await (const chunk of request.body) {
    length += chunk.byteLength
    if (length > maxBytes) throw new ApiError(413, '파일과 입력의 용량이 너무 커요.')
    chunks.push(Buffer.from(chunk))
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new ApiError(400, '입력을 확인해 주세요.') }
}
async function passwordDigest(password, salt) {
  const key = await crypto.subtle.importKey('raw', encode(password), 'PBKDF2', false, ['deriveBits'])
  return Buffer.from(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(salt, 'hex'), iterations: 100_000 }, key, 256)).toString('hex')
}
async function protect(password) {
  const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex')
  return `${salt}:${await passwordDigest(password, salt)}`
}
async function matches(password, hash) {
  if (typeof password !== 'string' || !password) return false
  const [salt, expected] = hash.split(':')
  const actual = await passwordDigest(password, salt)
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i)
  return diff === 0
}
function present(story, uid) {
  return { ...parseStoryDraft(story), id: story.id, revision: story.revision, createdAt: story.createdAt, updatedAt: story.updatedAt, protected: story.passwordHash !== null, editable: story.owner === uid }
}
async function identity(request, env, fetcher) {
  const authorization = request.headers.get('Authorization')
  if (!authorization) return null
  if (!/^Bearer [^\s]{1,8000}$/.test(authorization)) throw new ApiError(401, '다시 로그인해 주세요.')
  const account = await fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: authorization.slice(7) }), signal: AbortSignal.timeout(10000),
  })
  if (!account.ok) throw new ApiError(401, '다시 로그인해 주세요.')
  const user = (await account.json()).users?.[0]
  if (!user?.emailVerified || user.disabled || typeof user.localId !== 'string' || !user.providerUserInfo?.some(item => item.providerId === 'google.com')) throw new ApiError(403, '관리자 로그인이 필요해요.')
  // Firebase ID token + Firestore rules bind identity to this project and check the active Google sign-in provider.
  const admin = await fetcher(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/admins/${encodeURIComponent(user.localId)}`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(10000) })
  if (!admin.ok || (await admin.json()).fields?.enabled?.booleanValue !== true) throw new ApiError(403, '관리자 권한을 확인해 주세요.')
  return user.localId
}
export async function handleStories(request, env, fetcher = fetch, { logs = false } = {}) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin', 'Content-Type': 'application/json' }
  const reply = (status, value) => new Response(JSON.stringify(value), { status, headers })
  const origin = request.headers.get('Origin')
  const localOrigin = /^http:\/\/(?:127\.0\.0\.1|localhost):5173$/.test(env.STORY_LOCAL_ORIGIN || '') ? env.STORY_LOCAL_ORIGIN : null
  if (!origin || origin !== ORIGIN && origin !== localOrigin) return reply(403, { error: '허용되지 않은 요청이에요.' })
  headers['Access-Control-Allow-Origin'] = origin
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } })
  try {
    if (!env.STORY_GITHUB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.FIREBASE_PROJECT_ID) throw new ApiError(503, logs ? '로그 서버 연결을 설정해 주세요.' : '이야기 서버 연결을 설정해 주세요.')
    // IP is not logged or persisted; Cloudflare's limiter stores the digest only.
    const key = Buffer.from(await crypto.subtle.digest('SHA-256', encode(request.headers.get('CF-Connecting-IP') || 'unknown'))).toString('hex')
    if (!(await env.STORY_LIMITER.limit({ key })).success) throw new ApiError(429, '잠시 후 다시 시도해 주세요.')
    const match = (logs ? /^\/logs(?:\/([a-f0-9-]+)(?:\/(unlock|edit|delete))?)?$/ : /^\/stories(?:\/([a-f0-9-]+)(?:\/(unlock|edit))?)?$/).exec(new URL(request.url).pathname)
    if (!match || match[1] && !UUID.test(match[1])) throw denied()
    const [, id, action] = match
    if (!['GET', 'POST'].includes(request.method)) throw new ApiError(405, '지원하지 않는 요청이에요.')
    const writing = request.method === 'POST' && (!id || action === 'delete')
    const uid = writing || action === 'edit' || request.headers.has('Authorization') ? await identity(request, env, fetcher) : null
    if ((writing || action === 'edit') && !uid) throw new ApiError(401, '관리자 로그인이 필요해요.')
    const ghHeaders = { Authorization: `Bearer ${env.STORY_GITHUB_WRITE_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'kirari-stories', 'Content-Type': 'application/json' }
    const store = createStoryStore((path, body, method = 'GET', raw = false) => fetcher(`${STORY_REPO}${path}`, {
      method, headers: { ...ghHeaders, ...(raw ? { Accept: 'application/vnd.github.raw+json' } : {}) }, signal: AbortSignal.timeout(20000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), logs ? { directory: 'web-trpg-logs', archiveBytes: Infinity, indexBytes: Infinity, maxItems: Infinity, rawArchive: true, buildIndex: buildLogIndex, validateIndex: validLogIndex, validateArchive: items => validArchive(items, Infinity) && items.every(item => item.passwordHash !== null) } : {})
    if (request.method === 'GET' && !id) {
      // Compatibility for old archives until the one-time index build or next save.
      let index = await store.readIndex()
      if (logs) {
        // Legacy indexes gain metadata without writing or republishing original HTML.
        if (!index || index.some(item => item.logMetadataVersion !== LOG_METADATA_VERSION)) index = buildLogIndex(await store.readArchive())
        return reply(200, index.map(item => ({ id: item.id, title: item.title, editable: item.owner === uid, logDate: item.logDate, preview: item.preview })).sort(compareLogs))
      }
      index ??= buildStoryIndex(await store.readArchive())
      return reply(200, index.map(({ owner, ...summary }) => ({ ...summary, editable: owner === uid })).sort(compareStories))
    }
    const snapshot = writing ? await store.snapshot() : null
    const items = snapshot ? snapshot.items : await store.readArchive()
    if (request.method === 'GET') {
      const story = items.find(item => item.id === id)
      if (!story || action === 'unlock' || (action === 'edit' ? story.owner !== uid : story.passwordHash !== null)) throw denied()
      return reply(200, present(story, uid))
    }
    if (request.headers.get('Content-Type') !== 'application/json') throw new ApiError(415, 'JSON 입력만 지원해요.')
    const input = await bounded(request, action === 'delete' ? 1024 : logs ? Infinity : 500_000)
    if (action === 'delete') {
      const story = items.find(item => item.id === id)
      if (!story || story.owner !== uid) throw denied()
      if (!Number.isSafeInteger(input?.revision) || input.revision !== story.revision) throw new ApiError(409, '다른 곳에서 수정된 로그예요. 목록에서 다시 확인해 주세요.')
      await store.save(snapshot, items.filter(item => item.id !== id))
      return reply(200, { deleted: true })
    }
    if (id) {
      const story = items.find(item => item.id === id)
      if (action !== 'unlock') throw denied()
      if (!story || story.passwordHash && !await matches(input?.password, story.passwordHash)) throw logs ? new ApiError(404, '비밀번호가 다릅니다.') : denied()
      return reply(200, present(story, uid))
    }
    const draft = parseStoryDraft(input)
    if (!draft || !UUID.test(input.id) || !UUID.test(input.mutation) || !Number.isSafeInteger(input.revision) || input.revision < 0) throw new ApiError(400, '제목·본문·폰트 입력을 확인해 주세요.')
    const previous = items.find(item => item.id === input.id)
    if (previous && previous.owner !== uid) throw denied()
    if (logs) {
      if (!previous && (typeof input.password !== 'string' || !input.password.trim()) || input.password !== null && (typeof input.password !== 'string' || !input.password.trim())) throw new ApiError(400, '로그에는 비밀번호가 필요해요.')
      try { parseTrpgLog(draft.body) } catch { throw new ApiError(400, '시네마틱 로그 형식을 확인해 주세요.') }
    }
    if (previous?.mutation === input.mutation) return reply(200, present(previous, uid))
    if ((previous?.revision ?? 0) !== input.revision) throw new ApiError(409, '다른 곳에서 수정된 글이에요. 입력 내용을 복사하고 목록에서 다시 열어 주세요.')
    let passwordHash = previous?.passwordHash ?? null
    if (input.password !== null) {
      if (typeof input.password !== 'string') throw new ApiError(400, '비밀번호 입력을 확인해 주세요.')
      passwordHash = input.password ? await protect(input.password) : null
    }
    const now = new Date().toISOString()
    const story = { ...draft, ...(draft.fontSize === undefined && previous?.fontSize !== undefined ? { fontSize: previous.fontSize } : {}), ...(draft.writtenOn === undefined && previous?.writtenOn ? { writtenOn: previous.writtenOn } : {}), id: input.id, owner: uid, mutation: input.mutation, revision: input.revision + 1, createdAt: previous?.createdAt ?? now, updatedAt: now, passwordHash }
    const next = [...items.filter(item => item.id !== story.id), story]
    const content = JSON.stringify(next)
    if (!logs && (next.length > 100 || Buffer.byteLength(content) > MAX_BYTES)) throw new ApiError(413, '이야기 저장 한도(100개·전체 900KB)를 초과했어요.')
    await store.save(snapshot, next)
    return reply(200, present(story, uid))
  } catch (error) {
    if (error instanceof StoryStoreConflict) return reply(409, { error: '다른 저장과 겹쳤어요. 저장 버튼을 다시 눌러 주세요.' })
    return reply(error instanceof ApiError ? error.status : 502, { error: error instanceof ApiError ? error.message : '원격 저장을 확인하지 못했어요. 입력 내용은 유지돼요. 같은 저장 버튼으로 다시 시도해 주세요.' })
  }
}
export const handleTrpgLogs = (request, env, fetcher = fetch) => handleStories(request, env, fetcher, { logs: true })
export const handleAlbums = (request, env, fetcher = fetch) => handleSecretAlbums(request, env, fetcher, identity)
export default { fetch: (request, env) => new URL(request.url).pathname === '/photos'
  ? handleUpload(request, { ...env, PHOTO_GITHUB_WRITE_TOKEN: env.STORY_GITHUB_WRITE_TOKEN, UPLOAD_LIMITER: env.STORY_LIMITER, PHOTO_LOCAL_ORIGIN: env.STORY_LOCAL_ORIGIN })
  : /^\/secret-albums(?:\/|$)/.test(new URL(request.url).pathname) ? handleAlbums(request, env)
  : /^\/logs(?:\/|$)/.test(new URL(request.url).pathname) ? handleTrpgLogs(request, env) : handleStories(request, env) }
