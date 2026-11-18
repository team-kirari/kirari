import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { handleStories } from '../worker/stories.mjs'

const origin = 'https://team-kirari.github.io'
const draft = { title: '공개 승인 합성 시험', author: '합성 작성자', body: '<script>alert(1)</script>\njavascript:alert(1)', font: 'default', password: '', id: randomUUID(), revision: 0, mutation: randomUUID() }
function fixture() {
  let items = [], version = 0, conflict = false, enabled = true, writes = 0, failAfterWrite = false
  const env = { STORY_GITHUB_WRITE_TOKEN: 'fake-github-secret', FIREBASE_API_KEY: 'fake-key', FIREBASE_PROJECT_ID: 'fake-project', STORY_LIMITER: { limit: async () => ({ success: true }) } }
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
  const fetcher = async (url, options) => {
    if (url.includes('identitytoolkit')) {
      const token = JSON.parse(options.body).idToken
      if (token === 'expired') return json({}, 400)
      return json({ users: [{ localId: token, emailVerified: token !== 'unverified', providerUserInfo: [{ providerId: 'google.com' }] }] })
    }
    if (url.includes('firestore')) return enabled && options.headers.Authorization !== 'Bearer member' ? json({ fields: { enabled: { booleanValue: true } } }) : json({}, 403)
    assert.ok(url.startsWith('https://api.github.com/repos/team-kirari/kirari-private/contents/web-stories/archive.json'))
    assert.equal(options.headers.Authorization, 'Bearer fake-github-secret')
    if (options.method !== 'PUT') return version ? json({ type: 'file', encoding: 'base64', size: Buffer.byteLength(JSON.stringify(items)), content: Buffer.from(JSON.stringify(items)).toString('base64'), sha: String(version) }) : json({}, 404)
    const data = JSON.parse(options.body)
    if (conflict || data.sha !== (version ? String(version) : undefined)) return json({}, 409)
    assert.equal(data.branch, 'main')
    items = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')); version++; writes++
    if (failAfterWrite) { failAfterWrite = false; throw new Error('simulated lost response') }
    return json({}, 201)
  }
  async function request(path = '', body, token) {
    return handleStories(new Request(`https://kirari-stories.example.workers.dev/stories${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env, fetcher)
  }
  return { env, request, items: () => items, writes: () => writes, conflict: value => { conflict = value }, enabled: value => { enabled = value }, loseResponse: () => { failAfterWrite = true }, corrupt: () => { items = [{ unexpected: true }]; version++ } }
}
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
  assert.equal(list[0].title, '비밀번호로 보호된 이야기')
  assert.equal(list[0].author, '')
  assert.equal(list[0].editable, false)
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
test('input, paths, cross-origin requests, upstream conflict and rate limits fail closed', async () => {
  const f = fixture()
  const hostile = new Request('https://kirari-stories.example.workers.dev/stories', { headers: { Origin: 'https://hostile.invalid' } })
  assert.equal((await handleStories(hostile, f.env)).status, 403)
  const preflight = await handleStories(new Request(hostile.url, { method: 'OPTIONS', headers: { Origin: origin } }), f.env)
  assert.equal(preflight.status, 204)
  for (const input of [{ ...draft, font: '__proto__' }, { ...draft, id: '../secret' }, { ...draft, mutation: 'bad' }, { ...draft, password: 'short' }, { ...draft, body: 'a'.repeat(500_001) }]) assert.ok((await f.request('', input, 'A')).status >= 400)
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
