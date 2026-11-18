import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { parseStoryDraft, storyBlocks } from '../src/lib/stories.ts'
import { createLocalStoryMiddleware, createLocalStoryStore } from '../scripts/local-stories.ts'
import { privateRepoRoot } from '../scripts/private-repo.mjs'

const draft = { title: '합성 시험 글', author: '시험 작성자', body: '첫 문단\n대사\n\n***\n\n다음 장면', font: 'default', password: '' }
const koreanPassword = '테스트용한글암호입니다'

test('standalone scene markers, pasted CRLF and plain unsafe text retain their meaning', () => {
  assert.deepEqual(storyBlocks('첫 줄\r\n둘째 줄\r\n\r\n *** \r\n\r\n본문의 ***는 유지\n<img src=x onerror=alert(1)>\njavascript:alert(1)'), [
    { kind: 'paragraph', text: '첫 줄\n둘째 줄' }, { kind: 'scene' },
    { kind: 'paragraph', text: '본문의 ***는 유지\n<img src=x onerror=alert(1)>\njavascript:alert(1)' },
  ])
  assert.deepEqual(storyBlocks('***\n***\n'), [{ kind: 'scene' }, { kind: 'scene' }])
  for (const value of [null, [], { ...draft, title: '' }, { ...draft, body: 'x'.repeat(100_001) }, { ...draft, font: '__proto__' }, { ...draft, author: 3 }]) assert.equal(parseStoryDraft(value), null)
  assert.equal(parseStoryDraft({ ...draft, body: '<script>alert(1)</script>' }).body, '<script>alert(1)</script>')
})

test('private checkout override and CI fallback never depend on client variables', () => {
  const project = join(tmpdir(), 'kirari-project')
  assert.equal(privateRepoRoot(project, { KIRARI_PRIVATE_REPO_DIR: '../my-private' }), join(tmpdir(), 'my-private'))
  assert.equal(privateRepoRoot(project, { CI: 'true' }), join(project, '.local/kirari-private'))
  assert.equal(privateRepoRoot(project, { CI: 'true', VITE_PRIVATE_REPO_DIR: 'ignored' }), join(project, '.local/kirari-private'))
})

test('local stories round-trip, Korean password hashes stay private, revisions prevent lost updates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kirari-story-store-'))
  const store = createLocalStoryStore(root)
  assert.deepEqual(await store.list(), [])
  const story = await store.save({ ...draft, password: koreanPassword })
  const file = await readFile(join(root, 'stories', `${story.id}.json`), 'utf8')
  assert.equal(file.includes(koreanPassword), false)
  assert.equal('passwordHash' in story, false)
  assert.equal((await store.list())[0].title, '비밀번호로 보호된 이야기')
  assert.equal((await store.list())[0].author, '')
  await assert.rejects(store.get(story.id), { status: 404 })
  await assert.rejects(store.get(story.id, '틀린암호'), { status: 404 })
  assert.equal((await store.get(story.id, koreanPassword)).body, draft.body)
  assert.equal((await store.get(story.id, undefined, true)).title, draft.title)
  const updated = await store.save({ ...story, body: '수정한 합성 본문', password: null })
  assert.equal(updated.revision, 2)
  assert.equal((await store.get(story.id, koreanPassword)).body, '수정한 합성 본문')
  await assert.rejects(store.save({ ...story, body: '충돌 시험', password: '' }), { status: 409 })
  const unprotected = await store.save({ ...updated, password: '' })
  assert.equal(unprotected.protected, false)
  assert.equal((await store.get(story.id)).revision, 3)
  assert.equal((await store.list())[0].title, draft.title)
  const races = await Promise.allSettled([store.save({ ...unprotected, password: '' }), store.save({ ...unprotected, password: '' })])
  assert.equal(races.filter(item => item.status === 'fulfilled').length, 1)
  await assert.rejects(store.get('../README'), { status: 404 })
  await assert.rejects(store.save({ ...draft, id: '../README' }), { status: 404 })
  await assert.rejects(store.save({ ...draft, password: 'short' }), { status: 400 })
  await writeFile(join(root, 'stories', `${story.id}.json`), '{broken json')
  await assert.rejects(store.get(story.id), { status: 404 })
})

test('story directories cannot redirect writes through junctions or symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kirari-story-links-'))
  const elsewhere = await mkdtemp(join(tmpdir(), 'kirari-story-outside-'))
  await symlink(elsewhere, join(root, 'stories'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(createLocalStoryStore(root).save(draft), { status: 404 })
})

test('local API rejects cross-origin and oversized requests, separates reader from local author', async t => {
  const root = await mkdtemp(join(tmpdir(), 'kirari-story-api-'))
  const middleware = createLocalStoryMiddleware(root)
  const server = createServer((req, res) => { void middleware(req, res, () => { res.writeHead(404); res.end() }) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()) }))
  const base = `http://127.0.0.1:${server.address().port}/kirari/__local/stories`
  const headers = { 'X-Kirari-Local': '1', 'Content-Type': 'application/json' }
  assert.equal((await fetch(base)).status, 403)
  assert.equal((await fetch(base, { headers: { ...headers, Origin: 'https://untrusted.invalid' } })).status, 403)
  assert.equal((await fetch(base, { method: 'OPTIONS', headers })).status, 405)
  assert.equal((await fetch(base, { method: 'POST', headers, body: '{' })).status, 400)
  assert.equal((await fetch(base, { method: 'POST', headers, body: JSON.stringify({ body: 'x'.repeat(500_001) }) })).status, 413)
  const saved = await (await fetch(base, { method: 'POST', headers, body: JSON.stringify({ ...draft, password: koreanPassword }) })).json()
  assert.equal((await fetch(`${base}/${saved.id}`, { headers })).status, 404)
  const unlocked = await fetch(`${base}/${saved.id}/unlock`, { method: 'POST', headers, body: JSON.stringify({ password: koreanPassword }) })
  assert.equal(unlocked.status, 200)
  assert.equal(unlocked.headers.get('cache-control'), 'private, no-store')
  assert.equal((await unlocked.text()).includes('passwordHash'), false)
  assert.equal((await fetch(`${base}/${saved.id}/edit`, { headers })).status, 200)
  assert.equal((await fetch(`${base}/00000000-0000-0000-0000-000000000000/unlock`, { method: 'POST', headers, body: '{}' })).status, 404)
  for (let i = 0; i < 30; i++) await fetch(`${base}/${saved.id}/unlock`, { method: 'POST', headers, body: '{}' })
  assert.equal((await fetch(`${base}/${saved.id}/unlock`, { method: 'POST', headers, body: '{}' })).status, 429)
})
