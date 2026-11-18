import { inspectImage } from '../src/lib/profile-images.ts'
import { Buffer } from 'node:buffer'
import { parsePhotoMetadata } from '../src/lib/gallery-catalog.ts'

const origin = 'https://team-kirari.github.io'
const targets = { gallery: 'gallery', 'profiles/kenji/old': 'kenji-old', 'profiles/kenji/new': 'kenji-new', 'profiles/kiyo/old': 'kiyo-old', 'profiles/kiyo/new': 'kiyo-new' }
const hexDigest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))].map(byte => byte.toString(16).padStart(2, '0')).join('')
const encode = value => new TextEncoder().encode(value)

export async function authorizeAdmin(request, env, fetcher) {
  const authorization = request.headers.get('Authorization')
  if (!authorization || !/^Bearer [^\s]{1,8000}$/.test(authorization)) return 401
  const account = await fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: authorization.slice(7) }), signal: AbortSignal.timeout(10000),
  })
  if (!account.ok) return 401
  const user = (await account.json()).users?.[0]
  if (user?.emailVerified !== true || user.disabled || typeof user.localId !== 'string' || !user.localId || user.localId.length > 128
    || !user.providerUserInfo?.some(item => item.providerId === 'google.com')) return 403
  // The ID token is checked by Firebase; Firestore rules enforce the project,
  // current Google sign-in provider, and access to this user's own admin record.
  const admin = await fetcher(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/admins/${encodeURIComponent(user.localId)}`, {
    headers: { Authorization: authorization }, signal: AbortSignal.timeout(10000),
  })
  if (!admin.ok || (await admin.json()).fields?.enabled?.booleanValue !== true) return 403
  return 200
}

async function readImage(request) {
  if (!request.body) throw new Error('empty')
  const reader = request.body.getReader(), chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  if (!size) throw new Error('empty')
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return result
}

export async function handleUpload(request, env, fetcher = fetch) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' }
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
  const requestOrigin = request.headers.get('Origin')
  const localOrigin = /^http:\/\/(?:127\.0\.0\.1|localhost):5173$/.test(env.PHOTO_LOCAL_ORIGIN || '') ? env.PHOTO_LOCAL_ORIGIN : null
  if (!requestOrigin || requestOrigin !== origin && requestOrigin !== localOrigin) return reply(403, { error: '허용되지 않은 요청이에요.' })
  headers['Access-Control-Allow-Origin'] = requestOrigin
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Photo-Credit, X-Photo-Metadata' } })
  if (request.method !== 'POST') return reply(405, { error: 'POST만 지원해요.' })
  try {
    if (!env.PHOTO_GITHUB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.FIREBASE_PROJECT_ID) return reply(503, { error: '업로드 서버 설정을 확인해 주세요.' })
    // No IP address or authorization token is logged or persisted.
    const key = await hexDigest(encode(request.headers.get('CF-Connecting-IP') || 'unknown'))
    if (!(await env.UPLOAD_LIMITER.limit({ key })).success) return reply(429, { error: '잠시 후 다시 시도해 주세요.' })
  } catch { return reply(503, { error: '업로드 서버 설정을 확인해 주세요.' }) }
  try {
    const access = await authorizeAdmin(request, env, fetcher)
    if (access !== 200) return reply(access, { error: access === 401 ? '다시 로그인해 주세요.' : '관리자 권한이 필요해요.' })
  } catch { return reply(503, { error: '관리자 권한을 확인하지 못했어요. 다시 시도해 주세요.' }) }
  let credit
  try {
    credit = decodeURIComponent(request.headers.get('X-Photo-Credit') || '').trim()
    if (!credit || credit.length > 120 || [...credit].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('credit')
  } catch { return reply(400, { error: '저작권자 이름을 120자 이하로 입력해 주세요.' }) }
  let metadata
  try {
    const header = request.headers.get('X-Photo-Metadata')
    if (header && header.length > 16000) throw new Error('size')
    metadata = header ? parsePhotoMetadata(JSON.parse(decodeURIComponent(header))) : null
    if (header && (!metadata || metadata.credit !== credit)) throw new Error('metadata')
  } catch { return reply(400, { error: '제목·태그·앨범 정보를 확인해 주세요.' }) }
  const target = new URL(request.url).searchParams.get('target')
  if (!Object.hasOwn(targets, target)) return reply(400, { error: '등록 위치를 확인해 주세요.' })
  const mime = request.headers.get('Content-Type')
  let bytes
  try {
    bytes = await readImage(request)
    inspectImage(bytes, mime)
  } catch { return reply(400, { error: '사진 형식과 내용을 확인해 주세요.' }) }
  const id = await hexDigest(bytes)
  const path = `staging/${targets[target]}/${id}.json`
  const url = `https://api.github.com/repos/team-kirari/kirari-private/contents/${path}`
  const githubHeaders = { Authorization: `Bearer ${env.PHOTO_GITHUB_WRITE_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'kirari-photo-upload' }
  try {
    const existing = await fetcher(`${url}?ref=main`, { headers: githubHeaders, signal: AbortSignal.timeout(15000) })
    if (existing.status === 200) return reply(202, { status: 'staged', duplicate: true })
    if (existing.status !== 404) throw new Error('storage')
    const result = await fetcher(url, { method: 'PUT', headers: githubHeaders, signal: AbortSignal.timeout(20000), body: JSON.stringify({ message: 'Stage public photo for validation', content: Buffer.from(JSON.stringify({ version: 1, mime, credit, ...(metadata ? { metadata } : {}), image: Buffer.from(bytes).toString('base64') })).toString('base64'), branch: 'main' }) })
    if (result.status !== 201) throw new Error('storage')
    return reply(202, { status: 'staged', duplicate: false })
  } catch { return reply(502, { error: '저장소 등록에 실패했어요. 같은 파일로 다시 시도해 주세요.' }) }
}

export default { fetch: (request, env) => handleUpload(request, env) }
