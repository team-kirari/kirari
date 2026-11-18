import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { handleAlbums } from '../worker/stories.mjs'
import { inspectSecretImage, parseSecretAlbum, secretAlbumLimits } from '../src/lib/secret-albums.ts'
import { searchRecords } from '../src/lib/search.ts'

const origin = 'https://team-kirari.github.io'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1sAAAAASUVORK5CYII=', 'base64')
const draft = () => ({ id: randomUUID(), name: '합성 비밀 앨범' })
const photo = name => ({ id: randomUUID(), mime: 'image/png', image: png.toString('base64'), metadata: { title: '<img src=x onerror=alert(1)>', album: name, tags: ['비밀합성태그'], credit: '합성 작가' } })
function fixture() {
  let albums = [], version = 0, pending, conflict = false, lost = false, writes = 0, enabled = true
  const paths = []
  const sha = value => String(value).padStart(40, '0')
  const env = { STORY_GITHUB_WRITE_TOKEN: 'fake-secret-only', FIREBASE_API_KEY: 'fake-key', FIREBASE_PROJECT_ID: 'fake-project', STORY_LIMITER: { limit: async () => ({ success: true }) } }
  const fetcher = async (url, options) => {
    if (url.includes('identitytoolkit')) {
      const uid = JSON.parse(options.body).idToken
      return Response.json({ users: [{ localId: uid, emailVerified: uid !== 'unverified', disabled: uid === 'disabled', providerUserInfo: [{ providerId: uid === 'other-provider' ? 'password' : 'google.com' }] }] }, { status: uid === 'expired' ? 400 : 200 })
    }
    if (url.includes('firestore')) return Response.json({ fields: { enabled: { booleanValue: enabled && !['member-a', 'member-b', 'revoked'].includes(options.headers.Authorization.slice(7)) } } })
    assert.equal(options.headers.Authorization, 'Bearer fake-secret-only')
    const path = url.replace('https://api.github.com/repos/team-kirari/kirari-private', '')
    paths.push(path)
    const data = options.body ? JSON.parse(options.body) : undefined
    if (path.startsWith('/contents/web-secret-albums/archive.json?ref=')) {
      assert.equal(options.headers.Accept, 'application/vnd.github.raw+json')
      return version ? Response.json(albums) : new Response(null, { status: 404 })
    }
    if (path === '/git/ref/heads/main') return Response.json({ object: { type: 'commit', sha: sha(version) } })
    if (path === `/git/commits/${sha(version)}`) return Response.json({ tree: { sha: sha(version) } })
    if (path === '/git/trees') {
      assert.equal(data.base_tree, sha(version))
      assert.deepEqual(data.tree.map(file => file.path), ['web-secret-albums/archive.json', 'web-secret-albums/index.json'])
      assert.equal(data.tree[1].content, '[]')
      pending = JSON.parse(data.tree[0].content)
      return Response.json({ sha: sha(100) })
    }
    if (path === '/git/commits' && options.method === 'POST') {
      assert.deepEqual(data.parents, [sha(version)])
      assert.equal(data.message, 'Save private album')
      return Response.json({ sha: sha(101) })
    }
    if (path === '/git/refs/heads/main') {
      assert.equal(data.force, false)
      if (conflict) return new Response(null, { status: 422 })
      albums = pending; version++; writes++
      if (lost) { lost = false; throw new Error('simulated lost response') }
      return Response.json({ object: { sha: sha(version) } })
    }
    assert.fail(`Unexpected path: ${path}`)
  }
  const request = (path = '', body, token, overrides = {}) => handleAlbums(new Request(`https://worker.invalid/secret-albums${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...overrides }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env, fetcher)
  return { env, request, paths, albums: () => albums, writes: () => writes, enabled: value => { enabled = value }, conflict: value => { conflict = value }, lose: () => { lost = true }, corrupt: () => { albums = [{ unexpected: true }]; version++ } }
}

test('all album operations require active admin authentication before accessing storage', async () => {
  const f = fixture(), input = draft()
  for (const uid of [undefined, 'member-a', 'member-b', 'unverified', 'disabled', 'other-provider', 'expired', 'revoked']) {
    for (const [path, body] of [['', undefined], ['', input], [`/${input.id}`, undefined], [`/${input.id}/photos`, { revision: 1, photos: [photo(input.name)] }], [`/${input.id}/delete`, { revision: 1 }]]) {
      assert.ok((await f.request(path, body, uid)).status >= 400)
    }
  }
  assert.equal(f.paths.length, 0)
  const response = await f.request('', input, 'admin-a')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { id: input.id, name: input.name, revision: 1, editable: true })
  assert.ok(!('passwordHash' in f.albums()[0]))
})

test('admin A and B can list and open albums without a password; only owner can write or delete', async () => {
  const f = fixture(), input = draft(), image = photo(input.name)
  await f.request('', input, 'admin-a')
  assert.equal((await f.request(`/${input.id}/photos`, { revision: 1, photos: [image] }, 'admin-a')).status, 200)
  for (const uid of ['admin-a', 'admin-b']) {
    const summaries = await (await f.request('', undefined, uid)).json()
    assert.deepEqual(summaries, [{ id: input.id, name: input.name, revision: 2, editable: uid === 'admin-a' }])
    assert.ok(!JSON.stringify(summaries).includes(image.image))
    const response = await f.request(`/${input.id}`, undefined, uid)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
    assert.match(response.headers.get('X-Robots-Tag'), /noindex/)
    const data = await response.json()
    assert.equal(data.photos[0].image, image.image)
    assert.equal(data.photos[0].metadata.title, image.metadata.title)
    assert.equal(data.editable, uid === 'admin-a')
    for (const forbidden of ['owner', 'passwordHash', 'fake-secret-only']) assert.ok(!JSON.stringify(data).includes(forbidden))
    for (const path of [`/${input.id}/photos`, `/${input.id}/photos/${image.id}`, `/${input.id}/download`, `/${input.id}/preview`, '/open']) assert.ok((await f.request(path, undefined, uid)).status >= 400)
  }
  for (const action of ['photos', 'delete']) assert.equal((await f.request(`/${input.id}/${action}`, { revision: 2, photos: [image] }, 'admin-b')).status, 404)
  for (const uid of [undefined, 'member-a', 'member-b', 'revoked']) {
    assert.ok((await f.request(`/${input.id}`, undefined, uid)).status >= 400)
  }
})

test('deletion denies subsequent reads for every admin; revisions prevent stale deletion', async () => {
  const f = fixture(), input = draft()
  await f.request('', input, 'admin-a')
  await f.request(`/${input.id}/photos`, { revision: 1, photos: [photo(input.name)] }, 'admin-a')
  assert.equal((await f.request(`/${input.id}/delete`, { revision: 1 }, 'admin-a')).status, 409)
  assert.equal(f.albums().length, 1)
  assert.equal((await f.request(`/${input.id}/delete`, { revision: 2 }, 'admin-a')).status, 200)
  for (const uid of ['admin-a', 'admin-b']) {
    assert.equal((await f.request(`/${input.id}`, undefined, uid)).status, 404)
    assert.deepEqual(await (await f.request('', undefined, uid)).json(), [])
  }
})

test('revoking admin membership blocks subsequent list and photo requests with the same token', async () => {
  const f = fixture(), input = draft()
  await f.request('', input, 'admin-a')
  assert.equal((await f.request(`/${input.id}`, undefined, 'admin-a')).status, 200)
  const reads = f.paths.length
  f.enabled(false)
  for (const path of ['', `/${input.id}`]) assert.equal((await f.request(path, undefined, 'admin-a')).status, 403)
  assert.equal(f.paths.length, reads)
})

test('legacy password hashes do not gate admin reads and are removed on the next save', async () => {
  const f = fixture(), input = draft()
  await f.request('', input, 'admin-a')
  f.albums()[0].passwordHash = `${'0'.repeat(32)}:${'1'.repeat(64)}`
  const response = await f.request(`/${input.id}`, undefined, 'admin-b')
  assert.equal(response.status, 200)
  assert.ok(!('passwordHash' in await response.json()))
  assert.equal((await f.request(`/${input.id}/photos`, { revision: 1, photos: [photo(input.name)] }, 'admin-a')).status, 200)
  assert.ok(!('passwordHash' in f.albums()[0]))
})

test('retrying creation and image commits is idempotent after a lost response; Git conflicts never overwrite', async () => {
  const f = fixture(), input = draft(), image = photo(input.name)
  f.lose()
  assert.equal((await f.request('', input, 'admin-a')).status, 502)
  assert.equal((await f.request('', input, 'admin-a')).status, 200)
  assert.equal(f.writes(), 1)
  f.lose()
  const upload = { revision: 1, photos: [image] }
  assert.equal((await f.request(`/${input.id}/photos`, upload, 'admin-a')).status, 502)
  assert.equal((await f.request(`/${input.id}/photos`, upload, 'admin-a')).status, 200)
  assert.equal(f.writes(), 2)
  assert.equal(f.albums()[0].photos.length, 1)
  f.conflict(true)
  assert.equal((await f.request(`/${input.id}/delete`, { revision: 2 }, 'admin-a')).status, 409)
  assert.equal((await f.request(`/${input.id}`, undefined, 'admin-a')).status, 200)
})

test('malformed names, MIME, image dimensions, base64, metadata, paths and oversized inputs fail closed', async () => {
  const f = fixture(), input = draft(), image = photo(input.name)
  for (const bad of [{ name: '' }, { name: 'a\nb' }, { name: 'a'.repeat(81) }, { id: '../private' }]) assert.equal((await f.request('', { ...input, ...bad }, 'admin-a')).status, 400)
  await f.request('', input, 'admin-a')
  const oversized = Buffer.from(png); oversized.writeUInt32BE(9000, 16)
  for (const bad of [{ mime: 'image/svg+xml' }, { mime: 'image/jpeg' }, { image: 'javascript:alert(1)' }, { image: Buffer.from('<html/>').toString('base64') }, { image: oversized.toString('base64') }, { id: '../path' }, { metadata: { ...image.metadata, album: 'other' } }, { metadata: { ...image.metadata, private: true } }]) {
    assert.equal((await f.request(`/${input.id}/photos`, { revision: 1, photos: [{ ...image, ...bad }] }, 'admin-a')).status, 400)
  }
  assert.throws(() => inspectSecretImage(new Uint8Array(secretAlbumLimits.fileBytes + 1), 'image/png'))
  const excessivePixels = Buffer.from(png); excessivePixels.writeUInt32BE(6000, 16); excessivePixels.writeUInt32BE(6000, 20)
  assert.throws(() => inspectSecretImage(excessivePixels, 'image/png'))
  assert.equal((await f.request('/../../secret')).status, 404)
  assert.equal((await f.request(`/${input.id}/photos`, { revision: 1, photos: Array.from({ length: 41 }, () => image) }, 'admin-a')).status, 400)
  assert.equal((await f.request('', { junk: 'x'.repeat(3000) }, 'admin-a')).status, 413)
  assert.equal(f.albums()[0].photos.length, 0)
  f.corrupt()
  assert.equal((await f.request(`/${input.id}`, undefined, 'admin-a')).status, 502)
})

test('CORS, missing config and quotas protect album APIs before storage', async () => {
  const f = fixture()
  assert.equal((await f.request('', undefined, undefined, { Origin: 'https://evil.invalid' })).status, 403)
  assert.equal(f.paths.length, 0)
  const preflight = await handleAlbums(new Request('https://worker.invalid/secret-albums', { method: 'OPTIONS', headers: { Origin: origin } }), f.env)
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin)
  f.env.STORY_LIMITER.limit = async () => ({ success: false })
  assert.equal((await f.request('')).status, 429)
  delete f.env.STORY_GITHUB_WRITE_TOKEN
  assert.equal((await f.request('')).status, 503)
})

test('secret albums have no connection to public gallery search or asset publication', async () => {
  const f = fixture(), input = draft()
  await f.request('', input, 'admin-a')
  await f.request(`/${input.id}/photos`, { revision: 1, photos: [photo(input.name)] }, 'admin-a')
  assert.ok(f.paths.every(path => !/assets|staging|dispatch|web-stories/.test(path)))
  const valid = parseSecretAlbum(f.albums()[0])
  assert.equal(valid.name, input.name)
  assert.ok(!('passwordHash' in valid))
  const content = await readFile(new URL('../src/content.ts', import.meta.url), 'utf8')
  assert.ok(!content.includes('secret-albums'))
  const search = await readFile(new URL('../src/components/SearchScreen.tsx', import.meta.url), 'utf8')
  assert.ok(!search.includes('secretAlbum'))
  // Public build exports only allowlisted asset directories, never private archives.
  const assets = await readFile(new URL('../scripts/photo-assets.mjs', import.meta.url), 'utf8')
  assert.ok(!assets.includes('web-secret-albums'))
  assert.ok(!(await readdir(new URL('../public/', import.meta.url))).includes('web-secret-albums'))
  assert.deepEqual(searchRecords('비밀합성태그', { gallery: [], stories: [], logs: [] }), [])
})
