import test from 'node:test'
import assert from 'node:assert/strict'
import { authorized, handleUpload } from '../worker/index.mjs'
import { MAX_IMAGE_BYTES } from '../src/lib/profile-images.ts'

const secret = 'placeholder-master-key-32-characters-long'
function png() {
  const bytes = Buffer.alloc(24)
  bytes.set([137,80,78,71,13,10,26,10]); bytes.write('IHDR', 12); bytes.writeUInt32BE(2, 16); bytes.writeUInt32BE(3, 20)
  return bytes
}
function request({ origin = 'https://team-kirari.github.io', auth = `Bearer ${secret}`, method = 'POST', target = 'gallery', mime = 'image/png', body = png() } = {}) {
  return new Request(`https://upload.example/?target=${encodeURIComponent(target)}`, { method, headers: { Origin: origin, Authorization: auth, 'Content-Type': mime }, ...(method === 'POST' ? { body } : {}) })
}
const env = { PHOTO_UPLOAD_MASTER_KEY: secret, PHOTO_GITHUB_WRITE_TOKEN: 'fake-token', UPLOAD_LIMITER: { limit: async () => ({ success: true }) } }

test('exact bearer master key, bounded configuration and no missing key bypass', async () => {
  assert.equal(await authorized(`Bearer ${secret}`, secret), true)
  for (const input of [undefined, '', secret, `Bearer ${secret}x`]) assert.equal(await authorized(input, secret), false)
  assert.equal(await authorized('Bearer short', 'short'), false)
  assert.equal(await authorized('Bearer undefined', undefined), false)
})

test('CORS, method, quota and wrong key fail closed before storage', async () => {
  const never = async () => { assert.fail('Must not access GitHub') }
  for (const origin of ['', 'https://evil.example']) assert.equal((await handleUpload(request({ origin }), env, never)).status, 403)
  assert.equal((await handleUpload(request({ method: 'OPTIONS' }), env, never)).status, 204)
  assert.equal((await handleUpload(request({ method: 'GET' }), env, never)).status, 405)
  assert.equal((await handleUpload(request({ auth: 'Bearer wrong' }), env, never)).status, 401)
  assert.equal((await handleUpload(request(), { ...env, UPLOAD_LIMITER: { limit: async () => ({ success: false }) } }, never)).status, 429)
  assert.equal((await handleUpload(request(), { ...env, UPLOAD_LIMITER: undefined }, never)).status, 503)
})

test('rejects traversal, forged MIME, unsafe HTML, corrupt headers and over-limit streams', async () => {
  const never = async () => { assert.fail('Must not access GitHub') }
  for (const options of [{ target: '../private' }, { target: '__proto__' }, { mime: 'image/jpeg' }, { body: Buffer.from('<svg/>') }, { body: Buffer.alloc(MAX_IMAGE_BYTES + 1) }]) {
    assert.equal((await handleUpload(request(options), env, never)).status, 400)
  }
})

test('only private staging is written; response says staged rather than published', async () => {
  const calls = []
  const fetcher = async (url, options) => { calls.push({ url, options }); return { status: options.method === 'PUT' ? 201 : 404 } }
  const response = await handleUpload(request({ target: 'profiles/kenji/new' }), env, fetcher)
  assert.equal(response.status, 202)
  assert.deepEqual(await response.json(), { status: 'staged', duplicate: false })
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.match(calls[1].url, /kirari-private\/contents\/staging\/kenji-new\/[a-f0-9]{64}\.png$/)
  const body = JSON.parse(calls[1].options.body)
  assert.equal(body.sha, undefined)
  assert.deepEqual(Buffer.from(body.content, 'base64'), png())
  assert.equal((await handleUpload(request(), env, async () => ({ status: 403 }))).status, 502)
  assert.deepEqual(await (await handleUpload(request(), env, async () => ({ status: 200 }))).json(), { status: 'staged', duplicate: true })
})
