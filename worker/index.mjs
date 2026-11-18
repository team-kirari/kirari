import { inspectImage } from '../src/lib/profile-images.ts'
import { Buffer } from 'node:buffer'
import { parsePhotoMetadata } from '../src/lib/gallery-catalog.ts'

const origin = 'https://team-kirari.github.io'
const targets = { gallery: 'gallery', 'profiles/kenji/old': 'kenji-old', 'profiles/kenji/new': 'kenji-new', 'profiles/kiyo/old': 'kiyo-old', 'profiles/kiyo/new': 'kiyo-new' }
const hexDigest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))].map(byte => byte.toString(16).padStart(2, '0')).join('')
const encode = value => new TextEncoder().encode(value)
const repository = 'https://api.github.com/repos/team-kirari/kirari-private'
const githubHeaders = env => ({ Authorization: `Bearer ${env.PHOTO_GITHUB_WRITE_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'kirari-photo-upload' })
async function receiptKey(env) {
  return crypto.subtle.importKey('raw', encode(env.PHOTO_GITHUB_WRITE_TOKEN), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

// Blobs do not change main or trigger Actions. Publish all prepared photos with
// one fast-forward update; the marker makes retries after a lost response safe.
export async function commitPhotoBatch(entries, env, fetcher) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 200 || entries.some(entry => !entry || Object.keys(entry).sort().join(',') !== 'path,proof,sha'
    || typeof entry.path !== 'string' || !/^staging\/(?:gallery|kenji-old|kenji-new|kiyo-old|kiyo-new)\/[a-f0-9]{64}\.json$/.test(entry.path)
    || typeof entry.sha !== 'string' || !/^[a-f0-9]{40}$/.test(entry.sha)
    || typeof entry.proof !== 'string' || !/^[a-f0-9]{64}$/.test(entry.proof)) || new Set(entries.map(entry => entry.path)).size !== entries.length) throw new TypeError('Invalid batch')
  const key = await receiptKey(env)
  for (const entry of entries) {
    if (!await crypto.subtle.verify('HMAC', key, Buffer.from(entry.proof, 'hex'), encode(`${entry.path}\n${entry.sha}`))) throw new TypeError('Invalid receipt')
  }
  entries = entries.map(({ path, sha }) => ({ path, sha })).sort((a, b) => a.path.localeCompare(b.path))
  const marker = `.photo-batches/${await hexDigest(encode(JSON.stringify(entries)))}.json`
  const headers = githubHeaders(env)
  async function api(path, body) {
    const response = await fetcher(`${repository}${path}`, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error('storage')
    return response.json()
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const head = await api('/git/ref/heads/main')
    const existing = await fetcher(`${repository}/contents/${marker}?ref=${head.object.sha}`, { headers, signal: AbortSignal.timeout(15000) })
    if (existing.status === 200) return
    if (existing.status !== 404) throw new Error('storage')
    const parent = await api(`/git/commits/${head.object.sha}`)
    const tree = await api('/git/trees', { base_tree: parent.tree.sha, tree: [
      ...entries.map(entry => ({ ...entry, mode: '100644', type: 'blob' })),
      { path: marker, mode: '100644', type: 'blob', content: JSON.stringify(entries) },
    ] })
    const commit = await api('/git/commits', { message: `Stage ${entries.length} public photos for validation`, tree: tree.sha, parents: [head.object.sha] })
    const updated = await fetcher(`${repository}/git/refs/heads/main`, { method: 'PATCH', headers, signal: AbortSignal.timeout(20000), body: JSON.stringify({ sha: commit.sha, force: false }) })
    if (updated.ok) return
    if (![409, 422].includes(updated.status)) throw new Error('storage')
  }
  throw new Error('conflict')
}

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
  const batch = new URL(request.url).searchParams.get('batch')
  if (batch === 'upload') {
    try {
      const form = await request.formData()
      const files = form.getAll('photos')
      const metadata = JSON.parse(form.get('metadata'))
      if (!files.length || files.length > 200 || !Array.isArray(metadata) || metadata.length !== files.length
        || files.some(file => typeof file === 'string' || !file.size)) return reply(400, { error: '사진과 입력 정보를 확인해 주세요.' })
      const entries = new Map(), results = []
      for (let i = 0; i < files.length; i++) {
        const fields = parsePhotoMetadata(metadata[i])
        if (!fields) return reply(400, { error: '사진 정보를 확인해 주세요.' })
        const photo = new Request(request.url, { method: 'POST', headers: { 'Content-Type': files[i].type, 'X-Photo-Credit': encodeURIComponent(fields.credit), 'X-Photo-Metadata': encodeURIComponent(JSON.stringify(fields)) }, body: files[i] })
        const response = await stagePhoto(photo, env, fetcher, reply, true)
        if (response.status !== 202) return response
        const { status, duplicate, ...entry } = await response.json()
        if (status === 'prepared') {
          const repeated = entries.has(entry.path)
          if (!repeated) entries.set(entry.path, entry)
          results.push({ duplicate: repeated })
        } else results.push({ duplicate: duplicate === true })
      }
      if (entries.size) await commitPhotoBatch([...entries.values()], env, fetcher)
      return reply(202, { status: 'staged', results })
    } catch { return reply(502, { error: '일괄 접수에 실패했어요. 같은 사진으로 다시 시도해 주세요.' }) }
  }
  if (batch) return reply(400, { error: '등록 요청을 확인해 주세요.' })
  return stagePhoto(request, env, fetcher, reply)
}

async function stagePhoto(request, env, fetcher, reply, prepare = false) {
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
  const headersForGitHub = githubHeaders(env)
  try {
    const existing = await fetcher(`${url}?ref=main`, { headers: headersForGitHub, signal: AbortSignal.timeout(15000) })
    if (existing.status === 200) return reply(202, { status: 'staged', duplicate: true })
    if (existing.status !== 404) throw new Error('storage')
    const content = Buffer.from(JSON.stringify({ version: 1, mime, credit, ...(metadata ? { metadata } : {}), image: Buffer.from(bytes).toString('base64') })).toString('base64')
    if (prepare) {
      const blob = await fetcher(`${repository}/git/blobs`, { method: 'POST', headers: headersForGitHub, signal: AbortSignal.timeout(20000), body: JSON.stringify({ content, encoding: 'base64' }) })
      if (blob.status !== 201) throw new Error('storage')
      const { sha } = await blob.json()
      if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('storage')
      const proof = Buffer.from(await crypto.subtle.sign('HMAC', await receiptKey(env), encode(`${path}\n${sha}`))).toString('hex')
      return reply(202, { status: 'prepared', path, sha, proof })
    }
    const result = await fetcher(url, { method: 'PUT', headers: headersForGitHub, signal: AbortSignal.timeout(20000), body: JSON.stringify({ message: 'Stage public photo for validation', content, branch: 'main' }) })
    if (result.status !== 201) throw new Error('storage')
    return reply(202, { status: 'staged', duplicate: false })
  } catch { return reply(502, { error: '저장소 등록에 실패했어요. 같은 파일로 다시 시도해 주세요.' }) }
}

export default { fetch: (request, env) => handleUpload(request, env) }
