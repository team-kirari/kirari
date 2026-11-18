import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { handleStories } from '../worker/stories.mjs'
import { createStoryStore, buildStoryIndex } from '../worker/story-store.mjs'

const origin = 'https://team-kirari.github.io'
const draft = { title: '공개 승인 합성 시험', author: '합성 작성자', body: '<script>alert(1)</script>\njavascript:alert(1)', font: 'default', password: '', id: randomUUID(), revision: 0, mutation: randomUUID() }
function fixture() {
  let items = [], version = 0, conflict = false, enabled = true, writes = 0, failAfterWrite = false
  let index = null, pendingTree, pendingCommit
  const reads = []
  const sha = value => String(value).padStart(40, '0')
  const env = { STORY_GITHUB_WRITE_TOKEN: 'fake-github-secret', FIREBASE_API_KEY: 'fake-key', FIREBASE_PROJECT_ID: 'fake-project', STORY_LIMITER: { limit: async () => ({ success: true }) } }
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
  const fetcher = async (url, options) => {
    if (url.includes('identitytoolkit')) {
      const token = JSON.parse(options.body).idToken
      if (token === 'expired') return json({}, 400)
      return json({ users: [{ localId: token, emailVerified: token !== 'unverified', providerUserInfo: [{ providerId: 'google.com' }] }] })
    }
    if (url.includes('firestore')) return enabled && options.headers.Authorization !== 'Bearer member' ? json({ fields: { enabled: { booleanValue: true } } }) : json({}, 403)
    const path = url.replace('https://api.github.com/repos/team-kirari/kirari-private', '')
    assert.equal(options.headers.Authorization, 'Bearer fake-github-secret')
    const data = options.body ? JSON.parse(options.body) : undefined
    if (path.startsWith('/contents/')) {
      reads.push(path)
      const value = path.includes('/index.json') ? index : version ? items : null
      if (value === null) return json({}, 404)
      return json({ type: 'file', encoding: 'base64', size: Buffer.byteLength(JSON.stringify(value)), content: Buffer.from(JSON.stringify(value)).toString('base64'), sha: sha(version) })
    }
    if (path === '/git/ref/heads/main') return json({ object: { type: 'commit', sha: sha(version) } })
    if (path === `/git/commits/${sha(version)}`) return json({ tree: { sha: sha(version) } })
    if (path === '/git/trees') {
      assert.equal(data.base_tree, sha(version))
      pendingTree = data.tree
      for (const file of pendingTree) {
        assert.ok(['web-stories/archive.json', 'web-stories/index.json'].includes(file.path))
        assert.equal(file.type, 'blob')
        assert.equal(file.mode, '100644')
      }
      return json({ sha: sha(1001) }, 201)
    }
    if (path === '/git/commits' && options.method === 'POST') {
      assert.equal(data.tree, sha(1001))
      pendingCommit = data
      return json({ sha: sha(1002) }, 201)
    }
    if (path === '/git/refs/heads/main') {
      assert.equal(options.method, 'PATCH')
      assert.equal(data.force, false)
      assert.equal(data.sha, sha(1002))
      if (conflict || pendingCommit.parents[0] !== sha(version)) return json({}, 422)
      // Only the final reference update makes both files visible.
      for (const file of pendingTree) {
        if (file.path.endsWith('/archive.json')) items = JSON.parse(file.content)
        else index = JSON.parse(file.content)
      }
      version++; writes++
      if (failAfterWrite) { failAfterWrite = false; throw new Error('simulated lost response') }
      return json({ object: { sha: sha(version) } })
    }
    assert.fail(`Unexpected GitHub endpoint: ${path}`)

  }
  async function request(path = '', body, token) {
    return handleStories(new Request(`https://kirari-stories.example.workers.dev/stories${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env, fetcher)
  }
  return { env, request, store: createStoryStore((path, body, method = 'GET') => fetcher(`https://api.github.com/repos/team-kirari/kirari-private${path}`, { method, headers: { Authorization: 'Bearer fake-github-secret' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })), reads, index: () => index, setIndex: value => { index = value }, items: () => items, writes: () => writes, conflict: value => { conflict = value }, enabled: value => { enabled = value }, loseResponse: () => { failAfterWrite = true }, corrupt: () => { items = [{ unexpected: true }]; version++ } }
}
test('remote saves accept more than 100,000 characters within byte capacity', async () => {
  const f = fixture()
  const body = '가'.repeat(120_001)
  const response = await f.request('', { ...draft, body }, 'A')
  assert.equal(response.status, 200)
  const saved = await response.json()
  assert.equal(saved.body, body)
  assert.equal((await (await f.request(`/${saved.id}`)).json()).body, body)
})

test('remote saves commit immediately, preserve plain unsafe text, retries do not duplicate writes', async () => {
  const f = fixture()
  assert.equal((await f.request('', draft)).status, 401)
  for (const role of ['member', 'unverified', 'expired']) assert.ok((await f.request('', draft, role)).status >= 400)
  const result = await f.request('', draft, 'A')
  assert.equal(result.status, 200)
  assert.equal(result.headers.get('cache-control'), 'private, no-store')
  const saved = await result.json()
  assert.equal(saved.editable, true)
  assert.equal(saved.body, draft.body)
  assert.equal(saved.revision, 1)
  assert.equal(f.writes(), 1)
  assert.equal((await f.request('', draft, 'A')).status, 200)
  assert.equal(f.writes(), 1)
  assert.equal((await f.request(`/${saved.id}`)).status, 200)
  const update = { ...draft, revision: 1, mutation: randomUUID(), body: '수정한 합성 본문' }
  f.loseResponse()
  assert.equal((await f.request('', update, 'A')).status, 502)
  assert.equal((await f.request('', update, 'A')).status, 200)
  assert.equal(f.writes(), 2)
  assert.equal((await f.request('', { ...draft, mutation: randomUUID() }, 'A')).status, 409)
})
test('owner controls edit; password applies to guests, other admins, every read route', async () => {
  const f = fixture(), password = '한글합성시험비밀번호'
  const saved = await (await f.request('', { ...draft, password }, 'A')).json()
  const list = await (await f.request()).json()
  assert.equal(list[0].title, draft.title)
  assert.equal(list[0].author, '')
  assert.equal(list[0].editable, false)
  for (const field of ['body', 'passwordHash', 'password']) assert.equal(field in list[0], false)
  for (const role of [undefined, 'A', 'B']) {
    assert.equal((await f.request(`/${saved.id}`, undefined, role)).status, 404)
    assert.equal((await f.request(`/${saved.id}/unlock`, { password: 'wrong' }, role)).status, 404)
    const response = await f.request(`/${saved.id}/unlock`, { password }, role)
    const text = await response.text()
    assert.equal(response.status, 200)
    for (const secret of ['passwordHash', 'owner', 'mutation', password, 'fake-github-secret']) assert.equal(text.includes(secret), false)
  }
  assert.equal((await f.request(`/${saved.id}/edit`, undefined, 'B')).status, 404)
  assert.equal((await f.request(`/${saved.id}/edit`, undefined, 'A')).status, 200)
  assert.equal((await f.request('', { ...draft, revision: 1, mutation: randomUUID() }, 'B')).status, 404)
  f.enabled(false)
  assert.equal((await f.request(`/${saved.id}/edit`, undefined, 'A')).status, 403)
  assert.equal((await f.request('', { ...draft, revision: 1 }, 'A')).status, 403)
  assert.equal(f.items()[0].passwordHash.includes(password), false)
})
test('short and long passwords still require an exact match', async () => {
  for (const password of ['a', '한'.repeat(129)]) {
    const f = fixture()
    const response = await f.request('', { ...draft, password }, 'A')
    assert.equal(response.status, 200)
    const saved = await response.json()
    assert.equal(saved.protected, true)
    assert.equal((await f.request(`/${saved.id}`)).status, 404)
    for (const wrong of ['', password + 'x', 123]) {
      assert.equal((await f.request(`/${saved.id}/unlock`, { password: wrong })).status, 404)
    }
    assert.equal((await f.request(`/${saved.id}/unlock`, { password })).status, 200)
  }
})

test('input, paths, cross-origin requests, upstream conflict and rate limits fail closed', async () => {
  const f = fixture()
  const hostile = new Request('https://kirari-stories.example.workers.dev/stories', { headers: { Origin: 'https://hostile.invalid' } })
  assert.equal((await handleStories(hostile, f.env)).status, 403)
  const preflight = await handleStories(new Request(hostile.url, { method: 'OPTIONS', headers: { Origin: origin } }), f.env)
  assert.equal(preflight.status, 204)
  for (const input of [{ ...draft, font: '__proto__' }, { ...draft, id: '../secret' }, { ...draft, mutation: 'bad' }, { ...draft, password: 123 }, { ...draft, body: 'a'.repeat(500_001) }]) assert.ok((await f.request('', input, 'A')).status >= 400)
  assert.equal((await f.request('/invalid/edit', undefined, 'A')).status, 404)
  f.conflict(true)
  assert.equal((await f.request('', draft, 'A')).status, 409)
  assert.equal(f.writes(), 0)
  f.conflict(false)
  f.corrupt()
  assert.equal((await f.request()).status, 502)
  f.env.STORY_LIMITER.limit = async () => ({ success: false })
  assert.equal((await f.request()).status, 429)
})
test('archive size limit refuses a write without replacing the last confirmed data', async () => {
  const f = fixture()
  for (let index = 0; index < 9; index++) {
    assert.equal((await f.request('', { ...draft, id: randomUUID(), mutation: randomUUID(), body: 'a'.repeat(95_000) }, 'A')).status, 200)
  }
  assert.equal((await f.request('', { ...draft, id: randomUUID(), mutation: randomUUID(), body: 'a'.repeat(95_000) }, 'A')).status, 413)
  assert.equal(f.items().length, 9)
  assert.equal(f.writes(), 9)
})
test('local development Origin is denied by default and requires an exact loopback opt-in', async () => {
  const f = fixture()
  const preflight = origin => new Request('https://kirari-stories.example.workers.dev/stories', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } })
  const local = 'http://127.0.0.1:5173'
  assert.equal((await handleStories(preflight(local), f.env)).status, 403)
  f.env.STORY_LOCAL_ORIGIN = local
  const response = await handleStories(preflight(local), f.env)
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), local)
  assert.equal(response.headers.get('Vary'), 'Origin')
  for (const denied of ['http://localhost:5173', 'http://127.0.0.1:5174', 'https://hostile.invalid', 'null']) assert.equal((await handleStories(preflight(denied), f.env)).status, 403)
  const unauthenticated = new Request('https://kirari-stories.example.workers.dev/stories', { method: 'POST', headers: { Origin: local, 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
  assert.equal((await handleStories(unauthenticated, f.env)).status, 401)
  f.env.STORY_LOCAL_ORIGIN = 'https://hostile.invalid'
  assert.equal((await handleStories(preflight('https://hostile.invalid'), f.env)).status, 403)
})

test('remote writing dates survive saves and sort independently of edits with legacy fallback', async () => {
  const f = fixture()
  const save = async body => {
    const response = await f.request('', { ...body, mutation: randomUUID() }, 'A')
    assert.equal(response.status, 200)
    return response.json()
  }
  const legacy = await save(draft)
  const dated = await save({ ...draft, id: randomUUID(), writtenOn: '2000-01-01' })
  assert.equal(dated.writtenOn, '2000-01-01')
  const updated = await save({ ...draft, id: dated.id, revision: dated.revision, writtenOn: '2000-01-01', body: 'Synthetic edit' })
  assert.equal(updated.createdAt, dated.createdAt)
  const list = await (await f.request()).json()
  assert.deepEqual(list.map(item => item.id), [legacy.id, dated.id])
  assert.equal(list[0].createdAt, legacy.createdAt)
  assert.equal(list[1].writtenOn, dated.writtenOn)
  assert.equal((await (await f.request(`/${dated.id}`)).json()).writtenOn, '2000-01-01')
  const moved = await save({ ...draft, id: dated.id, revision: updated.revision, writtenOn: '9999-12-31' })
  assert.equal((await (await f.request()).json())[0].id, moved.id)
  const writes = f.writes()
  assert.equal((await f.request('', { ...draft, id: randomUUID(), mutation: randomUUID(), writtenOn: '2026-02-29' }, 'A')).status, 400)
  assert.equal(f.writes(), writes)
})

test('remote font sizes persist and invalid sizes cannot replace stored content', async () => {
  const f = fixture()
  const response = await f.request('', { ...draft, fontSize: 24 }, 'A')
  assert.equal(response.status, 200)
  const saved = await response.json()
  assert.equal(saved.fontSize, 24)
  assert.equal((await (await f.request(`/${saved.id}`)).json()).fontSize, 24)
  const invalid = await f.request('', { ...draft, revision: 1, mutation: randomUUID(), fontSize: '24' }, 'A')
  assert.equal(invalid.status, 400)
  assert.equal(f.writes(), 1)
  const edited = await f.request('', { ...draft, revision: 1, mutation: randomUUID(), fontSize: 32 }, 'A')
  assert.equal(edited.status, 200)
  assert.equal((await edited.json()).fontSize, 32)
})

test('list reads only the small index and never exposes owner or body', async () => {
  const f = fixture()
  await f.request('', { ...draft, body: 'a'.repeat(120_000) }, 'A')
  assert.ok(Buffer.byteLength(JSON.stringify(f.index())) < 1000)
  for (const role of [undefined, 'A', 'B']) {
    f.reads.length = 0
    const response = await f.request('', undefined, role)
    assert.equal(response.status, 200)
    assert.deepEqual(f.reads, ['/contents/web-stories/index.json?ref=main'])
    const [summary] = await response.json()
    assert.equal(summary.editable, role === 'A')
    for (const field of ['body', 'passwordHash', 'owner', 'mutation']) assert.equal(field in summary, false)
  }
  assert.equal((await f.request('', undefined, 'member')).status, 403)
})

test('password and metadata changes update the index in the same commit; conflicts preserve both', async () => {
  const f = fixture()
  await f.request('', draft, 'A')
  const update = { ...draft, revision: 1, mutation: randomUUID(), title: 'Changed title', writtenOn: '2000-01-01', password: 'secret' }
  f.conflict(true)
  assert.equal((await f.request('', update, 'A')).status, 409)
  assert.equal(f.index()[0].title, draft.title)
  assert.equal(f.items()[0].title, draft.title)
  f.conflict(false)
  assert.equal((await f.request('', update, 'A')).status, 200)
  assert.deepEqual(f.index(), buildStoryIndex(f.items()))
  assert.equal(f.index()[0].protected, true)
  assert.equal(f.index()[0].author, '')
  assert.equal((await f.request(`/${draft.id}`)).status, 404)
  assert.equal((await f.request('', { ...update, revision: 2, mutation: randomUUID(), password: '' }, 'A')).status, 200)
  assert.equal(f.index()[0].protected, false)
  assert.equal(f.index()[0].author, draft.author)
})

test('legacy archives fall back without writes; explicit rebuild changes only the index', async () => {
  const f = fixture()
  await f.request('', draft, 'A')
  f.setIndex(null)
  const original = structuredClone(f.items())
  const writes = f.writes()
  assert.equal((await f.request()).status, 200)
  assert.equal(f.writes(), writes)
  await f.store.rebuildIndex()
  assert.deepEqual(f.items(), original)
  assert.deepEqual(f.index(), buildStoryIndex(original))
  f.reads.length = 0
  assert.equal((await f.request()).status, 200)
  assert.equal(f.reads.length, 1)
})

test('malformed index fails closed without returning archive or extra fields', async () => {
  const f = fixture()
  await f.request('', draft, 'A')
  const original = structuredClone(f.index())
  for (const broken of [
    [{ ...original[0], body: 'must not leak' }],
    [{ ...original[0], protected: 'false' }],
    [{ ...original[0], writtenOn: '2026-02-29' }],
    [{ ...original[0], protected: true }],
    [original[0], original[0]],
    [{ ...original[0], title: 'x'.repeat(121) }],
  ]) {
    f.setIndex(broken)
    f.reads.length = 0
    const response = await f.request()
    assert.equal(response.status, 502)
    assert.equal(f.reads.length, 1)
    assert.equal((await response.text()).includes('must not leak'), false)
  }
})
