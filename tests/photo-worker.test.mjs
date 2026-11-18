import test from 'node:test'
import assert from 'node:assert/strict'
import { handleUpload, commitPhotoBatch } from '../worker/index.mjs'
import worker from '../worker/stories.mjs'

function png() {
  const bytes = Buffer.alloc(24)
  bytes.set([137,80,78,71,13,10,26,10]); bytes.write('IHDR', 12); bytes.writeUInt32BE(2, 16); bytes.writeUInt32BE(3, 20)
  return bytes
}
function request({ origin = 'https://team-kirari.github.io', auth = 'Bearer fake-id-token', method = 'POST', target = 'gallery', mime = 'image/png', body = png(), credit = '시험 작가', path = '/', metadata } = {}) {
  return new Request(`https://upload.example${path}?target=${encodeURIComponent(target)}`, { method, headers: { Origin: origin, Authorization: auth, 'Content-Type': mime, 'X-Photo-Credit': encodeURIComponent(credit), ...(metadata === undefined ? {} : { 'X-Photo-Metadata': encodeURIComponent(JSON.stringify(metadata)) }) }, ...(method === 'POST' ? { body } : {}) })
}
const env = { FIREBASE_API_KEY: 'fake-public-api-key', FIREBASE_PROJECT_ID: 'fake-project', PHOTO_GITHUB_WRITE_TOKEN: 'fake-token', UPLOAD_LIMITER: { limit: async () => ({ success: true }) } }
function mockFetch(storage, { uid = 'admin-a', enabled = true, verified = true, google = true, disabled = false, expired = false, denied = false } = {}) {
  return async (url, options) => {
    if (url.startsWith('https://identitytoolkit.googleapis.com/')) return Response.json({ users: [{ localId: uid, emailVerified: verified, disabled, providerUserInfo: google ? [{ providerId: 'google.com' }] : [] }] }, { status: expired ? 400 : 200 })
    if (url.startsWith('https://firestore.googleapis.com/')) {
      assert.ok(url.endsWith(`/admins/${uid}`))
      assert.equal(options.headers.Authorization, 'Bearer fake-id-token')
      return Response.json({ fields: { enabled: { booleanValue: enabled } } }, { status: denied ? 403 : 200 })
    }
    return storage(url, options)
  }
}
const never = async () => { assert.fail('Must not access GitHub') }

test('CORS, method, quota, missing auth and configuration fail before storage', async () => {
  for (const origin of ['', 'https://evil.example']) assert.equal((await handleUpload(request({ origin }), env, never)).status, 403)
  const preflight = await handleUpload(request({ method: 'OPTIONS' }), env, never)
  assert.equal(preflight.status, 204)
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /X-Photo-Credit/)
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /X-Photo-Metadata/)
  assert.equal((await handleUpload(request({ method: 'GET' }), env, never)).status, 405)
  for (const auth of ['', 'master-key', 'Bearer a b']) assert.equal((await handleUpload(request({ auth }), env, never)).status, 401)
  assert.equal((await handleUpload(request(), { ...env, UPLOAD_LIMITER: { limit: async () => ({ success: false }) } }, never)).status, 429)
  assert.equal((await handleUpload(request(), { ...env, FIREBASE_PROJECT_ID: undefined }, never)).status, 503)
})

test('members A/B, disabled/unverified identities, other providers, revoked tokens and denied rules cannot upload', async () => {
  for (const identity of [{ uid: 'member-a', enabled: false }, { uid: 'member-b', enabled: false }, { disabled: true }, { verified: false }, { google: false }, { denied: true }]) {
    assert.equal((await handleUpload(request(), env, mockFetch(never, identity))).status, 403)
  }
  assert.equal((await handleUpload(request(), env, mockFetch(never, { expired: true }))).status, 401)
  assert.equal((await handleUpload(request(), env, async () => { throw new Error('offline') })).status, 503)
})

test('rejects traversal, forged MIME, corrupt headers and malformed copyright', async () => {
  for (const options of [{ target: '../private' }, { target: '__proto__' }, { mime: 'image/jpeg' }, { body: Buffer.from('<svg/>') }, { credit: '' }, { credit: 'x'.repeat(121) }, { credit: 'a\nb' }]) {
    assert.equal((await handleUpload(request(options), env, mockFetch(never))).status, 400)
  }
})

test('admins A/B write atomic private bundles with copyright, and staging is never reported as published', async () => {
  for (const uid of ['admin-a', 'admin-b']) {
    const calls = []
    const fetcher = mockFetch(async (url, options) => { calls.push({ url, options }); return { status: options.method === 'PUT' ? 201 : 404 } }, { uid })
    const response = await handleUpload(request({ target: 'profiles/kenji/new' }), env, fetcher)
    assert.equal(response.status, 202)
    assert.deepEqual(await response.json(), { status: 'staged', duplicate: false })
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
    assert.match(calls[1].url, /kirari-private\/contents\/staging\/kenji-new\/[a-f0-9]{64}\.json$/)
    const body = JSON.parse(calls[1].options.body)
    const record = JSON.parse(Buffer.from(body.content, 'base64').toString())
    assert.equal(record.credit, '시험 작가')
    assert.equal(record.mime, 'image/png')
    assert.deepEqual(Buffer.from(record.image, 'base64'), png())
  }
  assert.equal((await handleUpload(request(), env, mockFetch(async () => ({ status: 403 })))).status, 502)
  assert.deepEqual(await (await handleUpload(request(), env, mockFetch(async () => ({ status: 200 })))).json(), { status: 'staged', duplicate: true })
})

test('upload stages tags and album atomically and rejects corrupt metadata before storage', async () => {
  const metadata = { title: '새 그림', tags: ['켄지', '키요'], album: '새 앨범', credit: '시험 작가' }
  const calls = []
  const response = await handleUpload(request({ metadata }), env, mockFetch(async (url, options) => {
    calls.push({ url, options }); return { status: options.method === 'PUT' ? 201 : 404 }
  }))
  assert.equal(response.status, 202)
  const record = JSON.parse(Buffer.from(JSON.parse(calls[1].options.body).content, 'base64').toString())
  assert.deepEqual(record.metadata, metadata)
  for (const bad of [{ tags: [42] }, { album: 'x'.repeat(81) }, { credit: '다른 작가' }, { private: true }]) {
    assert.equal((await handleUpload(request({ metadata: { ...metadata, ...bad } }), env, mockFetch(never))).status, 400)
  }
  const malformed = request()
  malformed.headers.set('X-Photo-Metadata', '%invalid')
  assert.equal((await handleUpload(malformed, env, mockFetch(never))).status, 400)
})

test('shared Worker routes photos with existing server bindings; local origin is opt-in', async () => {
  const environment = { FIREBASE_API_KEY: 'fake', FIREBASE_PROJECT_ID: 'fake', STORY_GITHUB_WRITE_TOKEN: 'fake', STORY_LIMITER: env.UPLOAD_LIMITER, STORY_LOCAL_ORIGIN: 'http://127.0.0.1:5173' }
  const response = await worker.fetch(request({ path: '/photos', method: 'OPTIONS', origin: 'http://127.0.0.1:5173' }), environment)
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:5173')
  assert.equal((await worker.fetch(request({ path: '/photos', method: 'OPTIONS', origin: 'http://evil.example:5173' }), environment)).status, 403)
})

test('accepts APNG MIME and images above former size and dimension limits', async () => {
  const bytes = Buffer.alloc(6 * 1024 * 1024); png().copy(bytes)
  bytes.writeUInt32BE(8000, 16); bytes.writeUInt32BE(6000, 20)
  const response = await handleUpload(request({ mime: 'image/apng', body: bytes }), env, mockFetch(async (_url, options) => ({ status: options.method === 'PUT' ? 201 : 404 })))
  assert.equal(response.status, 202)
})

function batchRequest(count, { corrupt = false } = {}) {
  const form = new FormData()
  for (let i = 0; i < count; i++) {
    const body = png(); body.writeUInt32BE(i + 1, 16)
    form.append('photos', new Blob([corrupt && i === count - 1 ? '<svg/>' : body], { type: 'image/png' }), `photo-${i}.png`)
  }
  form.append('metadata', JSON.stringify(Array.from({ length: count }, (_, i) => ({ title: `photo-${i}`, album: 'Album', tags: [], credit: 'Test artist' }))))
  return new Request('https://upload.example/?target=gallery&batch=upload', { method: 'POST', headers: { Origin: 'https://team-kirari.github.io', Authorization: 'Bearer fake-id-token' }, body: form })
}

test('one request with any selection size makes one commit; retries cannot redeploy it', async () => {
  for (const count of [1, 3, 14]) {
    let published = false, updates = 0, trees = 0, blobs = 0, conflicts = 0
    const storage = async (url, options) => {
      if (url.includes('/contents/staging/')) return new Response(null, { status: 404 })
      if (url.endsWith('/git/blobs')) {
        const record = JSON.parse(Buffer.from(JSON.parse(options.body).content, 'base64').toString())
        assert.equal(record.metadata.credit, 'Test artist')
        const sha = (blobs++ % count + 1).toString(16).padStart(40, '0')
        return Response.json({ sha }, { status: 201 })
      }
      if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: 'head' } })
      if (url.includes('/contents/.photo-batches/')) return new Response(null, { status: published ? 200 : 404 })
      if (url.endsWith('/git/commits/head')) return Response.json({ tree: { sha: 'base-tree' } })
      if (url.endsWith('/git/trees')) {
        trees++
        const body = JSON.parse(options.body)
        assert.equal(body.base_tree, 'base-tree')
        assert.equal(body.tree.length, count + 1)
        assert.equal(body.tree.filter(entry => entry.path.startsWith('staging/')).length, count)
        return Response.json({ sha: 'new-tree' }, { status: 201 })
      }
      if (url.endsWith('/git/commits')) return Response.json({ sha: 'new-commit' }, { status: 201 })
      assert.ok(url.endsWith('/git/refs/heads/main'))
      assert.deepEqual(JSON.parse(options.body), { sha: 'new-commit', force: false })
      if (count === 3 && conflicts++ === 0) return new Response(null, { status: 422 })
      updates++; published = true
      return Response.json({})
    }
    for (let retry = 0; retry < 2; retry++) {
      const response = await handleUpload(batchRequest(count), env, mockFetch(storage))
      assert.equal(response.status, 202)
      const result = await response.json()
      assert.equal(result.status, 'staged')
      assert.equal(result.results.length, count)
    }
    assert.equal(updates, 1)
    assert.equal(trees, count === 3 ? 2 : 1)
  }
})

test('batch authorization, corrupt files, invalid paths and forged receipts fail safely', async () => {
  assert.equal((await handleUpload(batchRequest(3), env, mockFetch(never, { enabled: false }))).status, 403)
  assert.equal((await handleUpload(batchRequest(0), env, mockFetch(never))).status, 400)
  let blobs = 0
  const response = await handleUpload(batchRequest(3, { corrupt: true }), env, mockFetch(async (url) => {
    if (url.includes('/contents/staging/')) return new Response(null, { status: 404 })
    assert.ok(url.endsWith('/git/blobs'))
    blobs++
    return Response.json({ sha: 'a'.repeat(40) }, { status: 201 })
  }))
  assert.equal(response.status, 400)
  assert.equal(blobs, 2)
  await assert.rejects(commitPhotoBatch([{ path: '../private', sha: 'a'.repeat(40), proof: 'a'.repeat(64) }], env, never), TypeError)
  await assert.rejects(commitPhotoBatch([{ path: `staging/gallery/${'a'.repeat(64)}.json`, sha: 'a'.repeat(40), proof: 'a'.repeat(64) }], env, never), TypeError)
})
