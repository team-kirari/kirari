import test from 'node:test'
import assert from 'node:assert/strict'
import { handleGallery } from '../worker/gallery.mjs'
import worker from '../worker/stories.mjs'
import { galleryEndpoint, readGalleryResponse } from '../src/lib/gallery-api.ts'
import { parseGalleryManifest } from '../src/lib/gallery-manifest.ts'

const endpoint = 'https://kirari-stories.example.workers.dev/gallery'
const photo = { id: 'a'.repeat(64), extension: 'webp', blob: 'b'.repeat(40), title: 'Test photo', album: 'Test album', tags: ['test'], credit: 'Test artist' }
const manifest = { version: 1, photos: [photo] }
const env = { STORY_GITHUB_WRITE_TOKEN: 'synthetic-server-token', STORY_LOCAL_ORIGIN: 'http://127.0.0.1:5173' }
const request = (path = '', options) => new Request(`${endpoint}${path}`, options)

test('public gallery list exposes only approved metadata and constructs fixed image URLs', async () => {
  const response = await handleGallery(request('', { headers: { Origin: 'https://team-kirari.github.io' } }), env, async (url, options) => {
    assert.match(url, /\/contents\/public-gallery.json\?ref=main$/)
    assert.equal(options.headers.Authorization, `Bearer ${env.STORY_GITHUB_WRITE_TOKEN}`)
    assert.equal(options.redirect, 'manual')
    return Response.json(manifest)
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://team-kirari.github.io')
  const data = await response.json()
  assert.equal(JSON.stringify(data).includes(photo.blob), false)
  assert.equal(JSON.stringify(data).includes(env.STORY_GITHUB_WRITE_TOKEN), false)
  assert.deepEqual(readGalleryResponse(data, endpoint), [{ id: photo.id, src: `${endpoint}/${photo.id}.webp`, title: photo.title, album: photo.album, tags: photo.tags, credit: photo.credit }])
})

test('guest image reads stream only the allowlisted blob, without forwarding private headers', async () => {
  const bytes = new Uint8Array([82, 73, 70, 70])
  let calls = 0
  const response = await handleGallery(request(`/${photo.id}.webp`), env, async (url, options) => {
    calls++
    if (calls === 1) return Response.json(manifest)
    assert.ok(url.endsWith(`/git/blobs/${photo.blob}`))
    assert.equal(options.redirect, 'manual')
    assert.equal(options.headers.Accept, 'application/vnd.github.raw+json')
    return new Response(bytes, { headers: { 'Set-Cookie': 'synthetic-cookie', 'X-Private': 'hidden' } })
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Content-Type'), 'image/webp')
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(response.headers.get('Set-Cookie'), null)
  assert.equal(response.headers.get('X-Private'), null)
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes)
  assert.equal(calls, 2)
})

test('unpublished, removed and wrong-extension images never reach private blobs', async () => {
  for (const [path, record] of [[`/${'c'.repeat(64)}.webp`, manifest], [`/${photo.id}.png`, manifest], [`/${photo.id}.webp`, { version: 1, photos: [] }]]) {
    let calls = 0
    const response = await handleGallery(request(path), env, async () => { calls++; return Response.json(record) })
    assert.equal(response.status, 404)
    assert.equal(calls, 1)
  }
})

test('credentialed upstream redirects are rejected without following or leaking their target', async () => {
  for (const redirectIndex of [true, false]) {
    let calls = 0
    const response = await handleGallery(request(redirectIndex ? '' : `/${photo.id}.webp`), env, async (_url, options) => {
      calls++
      assert.equal(options.redirect, 'manual')
      if (!redirectIndex && calls === 1) return Response.json(manifest)
      return new Response(null, { status: 302, headers: { Location: 'https://evil.example/private' } })
    })
    assert.equal(response.status, 502)
    assert.equal(calls, redirectIndex ? 1 : 2)
    assert.equal((await response.text()).includes('evil.example'), false)
  }
})

test('rejects traversal, arbitrary SHA/paths, origins, methods and unavailable configuration', async () => {
  const never = async () => assert.fail('Must not fetch private data')
  for (const path of ['/staging/a.json', '/%2e%2e%2fstories', '/private.png', `/${photo.id}.svg`, '?path=assets/img/private.png']) {
    assert.equal((await handleGallery(request(path), env, never)).status, 404)
  }
  assert.equal((await handleGallery(request('', { headers: { Origin: 'https://evil.example' } }), env, never)).status, 403)
  assert.equal((await handleGallery(request('', { method: 'POST' }), env, never)).status, 405)
  assert.equal((await handleGallery(request(), {}, never)).status, 503)
  assert.equal((await worker.fetch(request('', { method: 'OPTIONS', headers: { Origin: env.STORY_LOCAL_ORIGIN } }), env)).status, 204)
})

test('missing/corrupt indexes and upstream failures fail closed without disclosing details', async () => {
  for (const invalid of [null, { version: 2, photos: [] }, { ...manifest, private: true }, { version: 1, photos: [photo, photo] }, { version: 1, photos: [{ ...photo, blob: '../private' }] }, { version: 1, photos: [{ ...photo, credit: '' }] }]) {
    assert.equal(parseGalleryManifest(invalid), null)
    const response = await handleGallery(request(), env, async () => Response.json(invalid))
    assert.equal(response.status, 502)
    assert.equal((await response.text()).includes('synthetic-server-token'), false)
  }
  assert.equal((await handleGallery(request(), env, async () => new Response(null, { status: 404 }))).status, 502)
  assert.equal((await handleGallery(request(), env, async () => { throw new Error('private detail') })).status, 502)
})

test('client refuses injected sources and malformed metadata or endpoint configuration', () => {
  assert.equal(galleryEndpoint('https://kirari-stories.example.workers.dev/stories'), endpoint)
  assert.equal(galleryEndpoint(undefined), null)
  for (const url of ['javascript:alert(1)', 'https://evil.example/stories', 'https://kirari-stories.example.workers.dev/stories?token=x', 'https://user@kirari-stories.example.workers.dev/stories']) assert.throws(() => galleryEndpoint(url))
  const { blob, ...publicPhoto } = photo
  assert.ok(blob)
  for (const value of [{ version: 1, photos: [{ ...publicPhoto, src: 'javascript:alert(1)' }] }, { version: 1, photos: [{ ...publicPhoto, extension: 'svg' }] }, { version: 1, photos: [{ ...publicPhoto, tags: [42] }] }, { version: 1, photos: [publicPhoto, publicPhoto] }]) assert.throws(() => readGalleryResponse(value, endpoint))
})
