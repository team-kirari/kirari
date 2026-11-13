import { inspectImage, MAX_IMAGE_BYTES } from '../src/lib/profile-images.ts'
import { Buffer } from 'node:buffer'

const origin = 'https://team-kirari.github.io'
const targets = { gallery: 'gallery', 'profiles/kenji/old': 'kenji-old', 'profiles/kenji/new': 'kenji-new', 'profiles/kiyo/old': 'kiyo-old', 'profiles/kiyo/new': 'kiyo-new' }
const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
const hexDigest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))].map(byte => byte.toString(16).padStart(2, '0')).join('')
const encode = value => new TextEncoder().encode(value)

export async function authorized(input, secret) {
  if (typeof input !== 'string' || input.length > 256 || typeof secret !== 'string' || secret.length < 32 || secret.length > 200) return false
  const a = await crypto.subtle.digest('SHA-256', encode(input))
  const b = await crypto.subtle.digest('SHA-256', encode(`Bearer ${secret}`))
  let difference = 0
  const left = new Uint8Array(a), right = new Uint8Array(b)
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index]
  return difference === 0
}

async function readBounded(request) {
  if (!request.body) throw new Error('empty')
  const reader = request.body.getReader(), chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_IMAGE_BYTES) { await reader.cancel(); throw new Error('size') }
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
  if (request.headers.get('Origin') !== origin) return reply(403, { error: '허용되지 않은 요청이에요.' })
  headers['Access-Control-Allow-Origin'] = origin
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } })
  if (request.method !== 'POST') return reply(405, { error: 'POST만 지원해요.' })
  try {
    // Cloudflare supplies this IP header; the limiter keeps only a keyed hash.
    const hmac = await crypto.subtle.importKey('raw', encode(env.PHOTO_UPLOAD_MASTER_KEY || 'unconfigured'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const hash = await crypto.subtle.sign('HMAC', hmac, encode(request.headers.get('CF-Connecting-IP') || 'unknown'))
    const key = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
    if (!(await env.UPLOAD_LIMITER.limit({ key })).success) return reply(429, { error: '잠시 후 다시 시도해 주세요.' })
  } catch { return reply(503, { error: '업로드 서버 설정을 확인해 주세요.' }) }
  if (!await authorized(request.headers.get('Authorization'), env.PHOTO_UPLOAD_MASTER_KEY)) return reply(401, { error: '마스터키를 확인해 주세요.' })
  const target = new URL(request.url).searchParams.get('target')
  if (!Object.hasOwn(targets, target)) return reply(400, { error: '등록 위치를 확인해 주세요.' })
  const mime = request.headers.get('Content-Type')
  let bytes
  try {
    bytes = await readBounded(request)
    inspectImage(bytes, mime)
  } catch { return reply(400, { error: '사진 형식·용량·크기를 확인해 주세요.' }) }
  const id = await hexDigest(bytes)
  const path = `staging/${targets[target]}/${id}.${extensions[mime]}`
  const url = `https://api.github.com/repos/team-kirari/kirari-private/contents/${path}`
  const githubHeaders = { Authorization: `Bearer ${env.PHOTO_GITHUB_WRITE_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'kirari-photo-upload' }
  try {
    const existing = await fetcher(`${url}?ref=main`, { headers: githubHeaders, signal: AbortSignal.timeout(15000) })
    if (existing.status === 200) return reply(202, { status: 'staged', duplicate: true })
    if (existing.status !== 404) throw new Error('storage')
    const result = await fetcher(url, { method: 'PUT', headers: githubHeaders, signal: AbortSignal.timeout(20000), body: JSON.stringify({ message: 'Stage public photo for validation', content: Buffer.from(bytes).toString('base64'), branch: 'main' }) })
    if (result.status !== 201) throw new Error('storage')
    return reply(202, { status: 'staged', duplicate: false })
  } catch { return reply(502, { error: '저장소 등록에 실패했어요. 같은 파일로 다시 시도해 주세요.' }) }
}

export default { fetch: (request, env) => handleUpload(request, env) }
