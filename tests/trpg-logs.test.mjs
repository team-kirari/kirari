import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logIdFromHash, parseTrpgLog, validateLogFile, logMediaUrl } from '../src/lib/trpg-logs.ts'
import { createLocalStoryStore } from '../scripts/local-stories.ts'
import { handleTrpgLogs } from '../worker/stories.mjs'
import { readTrpgLogResponse } from '../src/lib/trpg-log-response.ts'
import { compareLogs, metadataFromLog, validLogMetadata } from '../src/lib/trpg-log-summary.ts'
import { buildLogIndex, validLogIndex } from '../worker/log-index.mjs'

const replay = overrides => ({ format: 'rollscene-studio-project-v1', assets: {}, messages: [{ speaker: '합성 화자', body: '합성 대사' }, { speaker: 'Narrator', body: '다음 장면' }], events: [], ...overrides })
const html = data => `<html><script>throw new Error('must never run'); const B64='${Buffer.from(JSON.stringify(data)).toString('base64')}';</script></html>`
const source = html(replay())
const draft = () => ({ title: '합성 비공개 로그', body: source, author: '', font: 'default', password: '합성 암호', id: randomUUID(), revision: 0, mutation: randomUUID() })

test('missing collection is empty while password failures and server errors remain errors', async () => {
  assert.deepEqual(await readTrpgLogResponse(new Response(JSON.stringify({ error: '글을 열 수 없어요.' }), { status: 404 }), true), [])
  assert.deepEqual(await readTrpgLogResponse(new Response('[]'), true), [])
  await assert.rejects(readTrpgLogResponse(new Response(JSON.stringify({ error: '글을 열 수 없어요.' }), { status: 404 })), /글을 열 수 없어요/)
  await assert.rejects(readTrpgLogResponse(new Response(JSON.stringify({ error: '서버 오류' }), { status: 502 }), true), /서버 오류/)
})

test('unlock translates previous server denial messages into a clear password error only for unlock', async () => {
  await assert.rejects(readTrpgLogResponse(new Response(JSON.stringify({ error: '글을 열 수 없어요.' }), { status: 404 }), false, true), { message: '비밀번호가 다릅니다.' })
  await assert.rejects(readTrpgLogResponse(new Response(JSON.stringify({ error: '서버 오류' }), { status: 502 }), false, true), { message: '서버 오류' })
})

test('only portable cinematic exports are accepted; HTML scripts never execute', () => {
  const parsed = parseTrpgLog(source)
  assert.equal(parsed.entries[0].speaker, '합성 화자')
  assert.equal(parsed.entries[1].narration, true)
  for (const value of ['PC: 대사', '<p><span>[main]</span><span>PC</span><span>대사</span></p>', '<div class="message general">Roll20</div>', '<div class="cca-wrap">CCA</div>', 'const B64="bad";', html({}), html(replay({ messages: [] }))]) assert.throws(() => parseTrpgLog(value))
  validateLogFile({ name: '합성.html', type: 'text/html', size: source.length })
  validateLogFile({ name: 'large.html', type: 'text/html', size: 100_000_000 })
  for (const file of [{ name: 'log.svg', type: 'text/html', size: 12 }, { name: 'log.html', type: 'image/svg+xml', size: 12 }, { name: 'log.html', type: '', size: NaN }, { name: 'log.html', type: 'text/html', size: 0 }]) assert.throws(() => validateLogFile(file))
})

test('rich text, narration settings, hidden tabs and backward scene state remain data only', () => {
  const parsed = parseTrpgLog(html(replay({ settings: { narrators: ['합성 안내자'] }, tabVisibility: { secret: false }, messages: [
    { speaker: '합성 안내자', content: [{ tag: 'p', children: ['<img src=x onerror=alert(1)>', { tag: 'br' }, '1D6 → 6'] }, { tag: 'script', text: 'never run' }] },
    { speaker: 'PC', body: '비밀 대사', tab: 'secret' }, { speaker: 'PC', body: '마지막 대사' },
  ], events: [{ layer: 'background', position: 0, sequence: 0, imageUrl: 'https://files.d20.io/a.png' }, { layer: 'background', position: 2, sequence: 1, imageUrl: 'javascript:alert(1)' }] })))
  assert.equal(parsed.entries[0].narration, true)
  assert.equal(parsed.entries[0].text, '<img src=x onerror=alert(1)>\n1D6 → 6')
  assert.equal(parsed.entries[1].visible, false)
  assert.equal(parsed.entries[0].background, 'https://files.d20.io/a.png')
  assert.equal(parsed.entries[2].background, '')
  assert.equal(parsed.entries[0].background, 'https://files.d20.io/a.png')
  for (const value of [html(replay({ messages: [null] })), html(replay({ messages: [{ speaker: 4 }] })), html(replay({ events: [{ layer: 'eval', position: 0, sequence: 1 }] })), html(replay({ tabVisibility: { main: 'true' } }))]) assert.throws(() => parseTrpgLog(value))
  let nested = ['nested']; for (let i = 0; i < 40; i++) nested = [{ children: nested }]
  assert.throws(() => parseTrpgLog(html(replay({ messages: [{ content: nested }] }))))
})

test('media URLs have exact HTTPS host boundaries and never expose private repo credentials', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html;base64,abc', 'data:image/svg+xml;base64,abc', '//files.d20.io/x', 'https://files.d20.io.evil.test/x', 'https://files.d20.io@evil.test/x', 'https://user:pass@files.d20.io/x', 'https://raw.githubusercontent.com/private/log', 'file:///local/log', 'https://evil.test/x', 'http://files.d20.io/x']) assert.equal(logMediaUrl(value), '')
  assert.equal(logMediaUrl('asset:portrait', { portrait: { src: 'https://files.d20.io/portrait.png' } }), 'https://files.d20.io/portrait.png')
})

test('log deletion checks owner and revision, removes archive and index, and blocks future reads', async () => {
  const f = fixture()
  const input = draft()
  assert.equal((await f.request('', input, 'A')).status, 200)
  const path = `/${input.id}/delete`
  assert.equal((await f.request(path, { revision: 1 })).status, 401)
  assert.equal((await f.request(path, { revision: 1 }, 'member')).status, 403)
  assert.equal((await f.request(path, { revision: 1 }, 'B')).status, 404)
  assert.equal((await f.request(path, { revision: 0 }, 'A')).status, 409)
  assert.equal((await f.request(path, { revision: 1 }, 'A', 'https://evil.test')).status, 403)
  assert.equal(f.writes(), 1)
  assert.equal((await f.request(path, { revision: 1 }, 'A')).status, 200)
  assert.deepEqual(f.archive(), [])
  assert.deepEqual(await (await f.request()).json(), [])
  assert.equal((await f.request(`/${input.id}/unlock`, { password: input.password })).status, 404)
  assert.equal((await f.request(`/${input.id}/edit`, undefined, 'A')).status, 404)
})

test('conflicting log deletion leaves the stored log accessible', async () => {
  const f = fixture(), input = draft()
  await f.request('', input, 'A')
  f.conflict()
  assert.equal((await f.request(`/${input.id}/delete`, { revision: 1 }, 'A')).status, 409)
  assert.equal(f.archive().length, 1)
})

test('local log deletion rejects stale revisions and removes only the requested log', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kirari-delete-log-'))
  const store = createLocalStoryStore(root, { logs: true })
  const input = draft()
  delete input.id
  const saved = await store.save(input)
  const other = await store.save(input)
  await assert.rejects(store.remove(saved.id, 0), /수정된 로그/)
  await assert.rejects(store.remove('../escape', 1))
  await store.remove(saved.id, saved.revision)
  await assert.rejects(store.get(saved.id, input.password))
  assert.deepEqual((await store.list()).map(item => item.id), [other.id])
})

function fixture() {
  let archive = null, index = null, version = 1, tree, commit, conflict = false, writes = 0, archiveReads = 0
  const sha = value => String(value).padStart(40, '0')
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
  const env = { STORY_GITHUB_WRITE_TOKEN: 'fake-github-secret', FIREBASE_API_KEY: 'fake-key', FIREBASE_PROJECT_ID: 'fake-project', STORY_LIMITER: { limit: async () => ({ success: true }) } }
  const fetcher = async (url, options) => {
    if (url.includes('identitytoolkit')) return json({ users: [{ localId: JSON.parse(options.body).idToken, emailVerified: true, providerUserInfo: [{ providerId: 'google.com' }] }] })
    if (url.includes('firestore')) return options.headers.Authorization === 'Bearer member' ? json({}, 403) : json({ fields: { enabled: { booleanValue: true } } })
    assert.equal(options.headers.Authorization, 'Bearer fake-github-secret')
    const path = url.replace('https://api.github.com/repos/team-kirari/kirari-private', '')
    const body = options.body && JSON.parse(options.body)
    if (path.startsWith('/contents/')) {
      assert.ok(path.startsWith('/contents/web-trpg-logs/'))
      if (path.includes('archive.json')) archiveReads++
      const value = path.includes('archive.json') ? archive : index
      if (value === null) return json({}, 404)
      assert.equal(options.headers.Accept, 'application/vnd.github.raw+json')
      return json(value)
    }
    if (path === '/git/ref/heads/main') return json({ object: { type: 'commit', sha: sha(version) } })
    if (path === `/git/commits/${sha(version)}`) return json({ tree: { sha: sha(version) } })
    if (path === '/git/trees') { tree = body.tree; assert.equal(body.base_tree, sha(version)); assert.deepEqual(tree.map(file => file.path), ['web-trpg-logs/archive.json', 'web-trpg-logs/index.json']); return json({ sha: sha(1001) }) }
    if (path === '/git/commits') { commit = body; return json({ sha: sha(1002) }) }
    if (path === '/git/refs/heads/main') {
      assert.equal(body.force, false)
      if (conflict || commit.parents[0] !== sha(version)) return json({}, 422)
      archive = JSON.parse(tree[0].content); index = JSON.parse(tree[1].content); version++; writes++
      return json({ object: { sha: sha(version) } })
    }
    assert.fail('unexpected endpoint')
  }
  const request = (path = '', body, token, origin = 'https://team-kirari.github.io') => handleTrpgLogs(new Request(`https://kirari-stories.example.workers.dev/logs${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env, fetcher)
  return { request, env, archive: () => archive, archiveReads: () => archiveReads, writes: () => writes, rebuildIndex: () => { index = buildLogIndex(archive) }, conflict: () => { conflict = true }, legacyIndex: () => { index = index.map(item => Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'logMetadataVersion'))) } }
}

test('prebuilt log index serves repeated lists without downloading or parsing the archive', async () => {
  const f = fixture()
  const input = { ...draft(), body: html(replay({ messages: [{ body: '합성 대사', timestamp: '2026-11-18T01:00:00Z' }], events: [{ layer: 'background', position: 0, sequence: 0, imageUrl: 'https://files.d20.io/opening.png' }] })) }
  assert.equal((await f.request('', input, 'A')).status, 200)
  f.legacyIndex()
  const expected = await (await f.request()).json()
  f.rebuildIndex()
  const index = buildLogIndex(f.archive())
  assert.equal(validLogIndex(index), true)
  for (const field of ['body', 'password', 'passwordHash', 'mutation']) assert.equal(Object.hasOwn(index[0], field), false)
  const reads = f.archiveReads(), writes = f.writes()
  for (let i = 0; i < 3; i++) assert.deepEqual(await (await f.request()).json(), expected)
  assert.equal(f.archiveReads(), reads)
  assert.equal(f.writes(), writes)
})

test('server requires active admin writes and a nonempty password, and rejects other export formats', async () => {
  const f = fixture()
  assert.equal((await f.request('', draft())).status, 401)
  assert.equal((await f.request('', draft(), 'member')).status, 403)
  assert.equal((await f.request('', draft(), 'A', 'https://evil.test')).status, 403)
  for (const password of ['', '   ', null]) assert.equal((await f.request('', { ...draft(), password }, 'A')).status, 400)
  assert.equal((await f.request('', { ...draft(), body: '<p>CCA</p>' }, 'A')).status, 400)
  assert.equal(f.writes(), 0)
})

test('everyone sees the title list; body requires a password and only the owner can edit', async () => {
  const f = fixture(), input = draft()
  const saved = await (await f.request('', input, 'A')).json()
  assert.equal(saved.protected, true)
  assert.ok(f.archive()[0].passwordHash && !f.archive()[0].passwordHash.includes(input.password))
  const list = await (await f.request()).json()
  assert.deepEqual(list, [{ id: saved.id, title: input.title, editable: false, logDate: null, preview: null }])
  assert.deepEqual(await (await f.request('', undefined, 'B')).json(), list)
  assert.deepEqual(await (await f.request('', undefined, 'A')).json(), [{ id: saved.id, title: input.title, editable: true, logDate: null, preview: null }])
  for (const key of ['body', 'author', 'owner', 'password', 'passwordHash', 'mutation', 'createdAt', 'updatedAt']) assert.equal(key in list[0], false)
  for (const token of [undefined, 'member', 'B']) {
    assert.equal((await f.request(`/${saved.id}`, undefined, token)).status, token === 'member' ? 403 : 404)
    assert.equal((await f.request(`/${saved.id}/edit`, undefined, token)).status, token === undefined ? 401 : token === 'member' ? 403 : 404)
    assert.equal((await f.request(`/${saved.id}/unlock`, { password: '틀림' }, token)).status, token === 'member' ? 403 : 404)
    // Password access itself needs no account and does not confer edit rights.
  }
  const unlockedResponse = await f.request(`/${saved.id}/unlock`, { password: input.password })
  assert.equal(unlockedResponse.status, 200)
  assert.equal(unlockedResponse.headers.get('cache-control'), 'private, no-store')
  const unlocked = await unlockedResponse.json()
  assert.equal(unlocked.body, source)
  for (const key of ['owner', 'passwordHash', 'password', 'mutation']) assert.equal(key in unlocked, false)
  assert.equal((await f.request(`/${randomUUID()}/unlock`, { password: input.password })).status, 404)
  for (const id of [saved.id, randomUUID()]) {
    const rejected = await f.request(`/${id}/unlock`, { password: '틀림' })
    assert.equal(rejected.status, 404)
    assert.deepEqual(await rejected.json(), { error: '비밀번호가 다릅니다.' })
  }
  assert.equal((await f.request('', { ...input, revision: 1, mutation: randomUUID() }, 'B')).status, 404)
  assert.equal((await f.request(`/${saved.id}/edit`, undefined, 'A')).status, 200)
  assert.equal((await (await f.request('', undefined, 'A')).json())[0].title, input.title)
  f.env.STORY_LIMITER.limit = async () => ({ success: false })
  assert.equal((await f.request(`/${saved.id}/unlock`, { password: input.password })).status, 429)
})

test('share links contain only an exact log ID and grant no password bypass', () => {
  const id = randomUUID()
  assert.equal(logIdFromHash(`#trpg?log=${id}`), id)
  for (const hash of [`#trpg?log=../${id}`, `#trpg?log=${id}&password=example`, '#trpg?log=javascript:alert(1)', '#trpg']) assert.equal(logIdFromHash(hash), null)
})

test('password rotation takes effect, revisions and Git ref conflicts preserve existing logs, retries are idempotent', async () => {
  const f = fixture(), input = draft()
  assert.equal((await f.request('', input, 'A')).status, 200)
  assert.equal((await f.request('', input, 'A')).status, 200)
  assert.equal(f.writes(), 1)
  assert.equal((await f.request('', { ...input, password: '', revision: 1, mutation: randomUUID() }, 'A')).status, 400)
  assert.equal((await f.request('', { ...input, password: '변경한 암호', revision: 1, mutation: randomUUID() }, 'A')).status, 200)
  assert.equal((await f.request(`/${input.id}/unlock`, { password: input.password })).status, 404)
  assert.equal((await f.request(`/${input.id}/unlock`, { password: '변경한 암호' })).status, 200)
  assert.equal((await f.request('', { ...input, revision: 2, password: null, mutation: randomUUID() }, 'A')).status, 200)
  assert.equal((await f.request(`/${input.id}/unlock`, { password: '변경한 암호' })).status, 200)
  assert.equal((await f.request('', { ...input, mutation: randomUUID() }, 'A')).status, 409)
  f.conflict()
  assert.equal((await f.request('', { ...input, revision: 3, password: null, mutation: randomUUID() }, 'A')).status, 409)
  assert.equal(f.writes(), 3)
})

test('Korean passwords, including a single character and long phrases, round-trip exactly locally and remotely', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kirari-trpg-password-'))
  const store = createLocalStoryStore(root, { logs: true })
  for (const password of ['한', '한글 비밀번호 🔑 '.repeat(1024)]) {
    const f = fixture(), input = { ...draft(), password }
    assert.equal((await f.request('', input, 'A')).status, 200)
    assert.equal((await f.request(`/${input.id}/unlock`, { password })).status, 200)
    assert.equal((await f.request(`/${input.id}/unlock`, { password: password + '다름' })).status, 404)
    const local = await store.save({ title: input.title, body: input.body, author: '', font: 'default', password })
    assert.equal((await store.get(local.id, password)).body, input.body)
    await assert.rejects(store.get(local.id, password + '다름'))
  }
})

test('cinematic HTML exceeds the former file, request and archive caps and round-trips privately', async () => {
  const f = fixture()
  const body = html(replay({ assets: { synthetic: { src: 'x'.repeat(16_000_000) } } }))
  assert.ok(Buffer.byteLength(body) > 20_000_000)
  const input = { ...draft(), body }
  assert.equal((await f.request('', input, 'A')).status, 200)
  const result = await f.request(`/${input.id}/unlock`, { password: input.password })
  assert.equal(result.status, 200)
  assert.equal((await result.json()).body, body)
})

test('local checkout separates logs from stories and never returns hashes or passwordless logs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kirari-trpg-'))
  const store = createLocalStoryStore(root, { logs: true })
  const input = draft()
  delete input.id
  delete input.revision
  delete input.mutation
  await assert.rejects(store.save({ ...input, password: '' }))
  await assert.rejects(store.save({ ...input, body: '<p>CCA</p>' }))
  const saved = await store.save(input)
  await assert.rejects(store.get(saved.id))
  await assert.rejects(store.get(saved.id, '틀림'))
  await assert.rejects(store.get(saved.id, '틀림'), { message: '비밀번호가 다릅니다.' })
  await assert.rejects(store.get(randomUUID(), '틀림'), { message: '비밀번호가 다릅니다.' })
  assert.equal((await store.get(saved.id, input.password)).body, source)
  const file = await readFile(join(root, 'trpg-logs', `${saved.id}.json`), 'utf8')
  assert.ok(!file.includes(input.password))
  assert.ok(!('passwordHash' in saved))
  assert.deepEqual(await createLocalStoryStore(root).list(), [])
})


test('list metadata uses earliest source day in Korea and the opening foreground or background', () => {
  const body = html(replay({ messages: [
    { body: '합성 대사', timestamp: '2026-10-05T16:05:52.099Z' },
    { body: '합성 대사', timestamp: '2026-10-04T23:00:00Z' },
  ], events: [
    { layer: 'background', position: 0, sequence: 0, imageUrl: 'https://files.d20.io/background.png' },
    { layer: 'foreground', position: 0, sequence: 1, imageUrl: 'https://files.d20.io/opening.png' },
    { layer: 'foreground', position: 1, sequence: 2, imageUrl: 'https://files.d20.io/spoiler.png' },
  ] }))
  assert.deepEqual(metadataFromLog(body), { logDate: '2026-10-05', preview: 'https://files.d20.io/opening.png' })
  assert.equal(metadataFromLog(html(replay({ messages: [{ body: '합성 대사', timestamp: 'October 03, 2026 10:31AM' }] }))).logDate, '2026-10-03')
  for (const timestamp of ['', '10:31AM', '2026-02-30T12:00:00Z', 'February 30, 2026 10:31AM', 123, { date: '2026-01-01' }]) {
    assert.equal(metadataFromLog(html(replay({ messages: [{ body: '합성 대사', timestamp }] }))).logDate, null)
  }
  assert.equal(metadataFromLog(html(replay({ events: [{ layer: 'background', position: 1, sequence: 0, imageUrl: 'https://files.d20.io/later.png' }] }))).preview, null)
  assert.equal(metadataFromLog(html(replay({ events: [
    { layer: 'background', position: 0, sequence: 0, imageUrl: 'https://files.d20.io/background.png' },
    { layer: 'foreground', position: 0, sequence: 1, status: 'clear' },
    { layer: 'foreground', position: 1, sequence: 2, imageUrl: 'https://files.d20.io/first-foreground.png' },
    { layer: 'foreground', position: 2, sequence: 3, imageUrl: 'https://files.d20.io/second-foreground.png' },
  ] }))).preview, 'https://files.d20.io/background.png')
  assert.equal(metadataFromLog(html(replay({ events: [
    { layer: 'background', position: 0, sequence: 0, imageUrl: 'https://files.d20.io/background.png' },
  ] }))).preview, 'https://files.d20.io/background.png')
  for (const emptyForeground of [
    { imageUrl: 'ccfolia:none' }, { status: 'clear', imageUrl: 'https://files.d20.io/cleared.png' },
    { imageSize: { width: 0, height: 0 }, imageUrl: 'https://files.d20.io/hidden.png' },
  ]) assert.equal(metadataFromLog(html(replay({ events: [
    { layer: 'background', position: 0, sequence: 1, imageUrl: 'https://files.d20.io/opening-background.png' },
    { layer: 'foreground', position: 0, sequence: 2, ...emptyForeground },
    { layer: 'foreground', position: 1, sequence: 3, imageUrl: 'https://files.d20.io/later-foreground.png' },
  ] }))).preview, 'https://files.d20.io/opening-background.png')
  assert.deepEqual([{ id: 'a', logDate: null }, { id: 'b', logDate: '2026-01-01' }, { id: 'c', logDate: '2026-10-03' }].sort(compareLogs).map(item => item.id), ['c', 'b', 'a'])
  for (const preview of ['javascript:alert(1)', 'data:text/html;base64,YQ==', 'data:audio/mp3;base64,YQ==', 'https://files.d20.io.evil.test/image.png', 'data:image/svg+xml;base64,YQ==', 'https://user:pass@files.d20.io/image.png']) assert.equal(validLogMetadata({ logDate: null, preview }), false)
})

test('source dates and opening images appear in local and remote lists; legacy indexes work without writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kirari-trpg-summary-'))
  const local = createLocalStoryStore(root, { logs: true })
  const f = fixture()
  for (const logDate of ['2026-01-02', '2026-10-05']) {
    const input = { ...draft(), body: html(replay({ messages: [{ body: '합성 대사', timestamp: logDate + 'T01:00:00Z' }], events: [{ layer: 'foreground', position: 0, sequence: 0, imageUrl: 'https://files.d20.io/opening.png' }] })) }
    assert.equal((await f.request('', input, 'A')).status, 200)
    const localInput = { ...input }; delete localInput.id; delete localInput.revision
    await local.save(localInput)
  }
  const remote = await (await f.request()).json()
  assert.deepEqual(remote.map(item => item.logDate), ['2026-10-05', '2026-01-02'])
  assert.deepEqual(Object.keys(remote[0]).sort(), ['editable', 'id', 'logDate', 'preview', 'title'])
  assert.ok(remote.every(item => item.preview === 'https://files.d20.io/opening.png'))
  assert.deepEqual((await local.list()).sort(compareLogs).map(item => item.logDate), remote.map(item => item.logDate))
  const writes = f.writes()
  f.legacyIndex()
  assert.deepEqual(await (await f.request()).json(), remote)
  assert.equal(f.writes(), writes)
})
