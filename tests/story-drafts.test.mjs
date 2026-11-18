import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyStoryBackups, readStoryBackups, storyDraftKey, writeStoryBackups } from '../src/lib/story-drafts.ts'

const key = storyDraftKey(false)
const backup = () => ({
  draft: { title: '', author: 'Synthetic writer', body: '  unfinished\r\n<script>alert(1)</script>\njavascript:alert(1)', font: 'default', fontSize: 22, writtenOn: '' },
  protect: true, revision: 0, savedAt: '2026-11-18T12:00:00.000Z',
})
function memoryStorage() {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
}

test('unfinished drafts preserve exact text and formatting without persisting passwords or unknown fields', () => {
  const storage = memoryStorage()
  const record = backup()
  record.password = 'synthetic-do-not-persist'
  record.passwordConfirm = 'synthetic-do-not-persist'
  record.draft.token = 'synthetic-token'
  const state = { ...emptyStoryBackups(), auto: record }
  writeStoryBackups(storage, key, state)
  const raw = storage.getItem(key)
  for (const secret of ['synthetic-do-not-persist', 'synthetic-token', 'password', 'token']) assert.equal(raw.includes(secret), false)
  const restored = readStoryBackups(storage, key).auto
  assert.equal(restored.draft.body, record.draft.body)
  assert.equal(restored.draft.title, '')
  assert.equal(restored.draft.writtenOn, '')
  assert.equal(restored.draft.fontSize, 22)
  assert.equal(restored.protect, true)
})

test('automatic drafts and three manual slots remain independent and can be deleted', () => {
  const storage = memoryStorage()
  assert.deepEqual(readStoryBackups(storage, key), emptyStoryBackups())
  const state = emptyStoryBackups()
  for (let index = 0; index < 3; index++) state.slots[index] = { ...backup(), draft: { ...backup().draft, title: `Slot ${index + 1}` } }
  writeStoryBackups(storage, key, state)
  let saved = readStoryBackups(storage, key)
  saved.auto = { ...backup(), draft: { ...backup().draft, body: 'New automatic draft' } }
  writeStoryBackups(storage, key, saved)
  saved = readStoryBackups(storage, key)
  assert.deepEqual(saved.slots.map(slot => slot.draft.title), ['Slot 1', 'Slot 2', 'Slot 3'])
  saved.auto = null
  saved.slots[1] = null
  writeStoryBackups(storage, key, saved)
  assert.equal(readStoryBackups(storage, key).auto, null)
  assert.equal(readStoryBackups(storage, key).slots[1], null)
  assert.equal(readStoryBackups(storage, key).slots[2].draft.title, 'Slot 3')
  storage.removeItem(key)
  assert.deepEqual(readStoryBackups(storage, key), emptyStoryBackups())
})

test('new stories, individual edits and local/remote modes have isolated browser drafts', () => {
  const storage = memoryStorage()
  const keys = [key, storyDraftKey(true), storyDraftKey(true, 'story-a'), storyDraftKey(true, 'story-b')]
  assert.equal(new Set(keys).size, 4)
  writeStoryBackups(storage, keys[2], { ...emptyStoryBackups(), auto: { ...backup(), revision: 12 } })
  assert.equal(readStoryBackups(storage, keys[2]).auto.revision, 12)
  for (const other of [keys[0], keys[1], keys[3]]) assert.equal(readStoryBackups(storage, other).auto, null)
})

test('corrupt, oversized, hostile and unsupported browser records fail closed', () => {
  const storage = memoryStorage()
  for (const raw of ['{broken', 'null', '[]', 'x'.repeat(2_500_001), JSON.stringify({ version: 99, slots: [null, null, null], auto: null })]) {
    storage.setItem(key, raw)
    assert.throws(() => readStoryBackups(storage, key))
  }
  for (const patch of [{ font: '__proto__' }, { font: 'javascript:alert(1)' }, { fontSize: '22' }, { fontSize: 999 }, { title: 'x'.repeat(121) }, { author: 'x'.repeat(61) }, { writtenOn: '2026-02-29' }]) {
    const auto = { ...backup(), draft: { ...backup().draft, ...patch } }
    storage.setItem(key, JSON.stringify({ version: 1, auto, slots: [null, null, null] }))
    assert.throws(() => readStoryBackups(storage, key))
    assert.throws(() => writeStoryBackups(storage, key, { ...emptyStoryBackups(), auto }))
  }
  for (const patch of [{ revision: -1 }, { revision: 1.5 }, { savedAt: 'bad date' }, { protect: 'yes' }]) {
    storage.setItem(key, JSON.stringify({ version: 1, auto: { ...backup(), ...patch }, slots: [null, null, null] }))
    assert.throws(() => readStoryBackups(storage, key))
  }
})

test('long browser drafts round-trip and capacity failures leave confirmed data intact', () => {
  const storage = memoryStorage()
  const auto = { ...backup(), draft: { ...backup().draft, body: '가'.repeat(120_001) } }
  const state = { ...emptyStoryBackups(), auto }
  writeStoryBackups(storage, key, state)
  assert.equal(readStoryBackups(storage, key).auto.draft.body, auto.draft.body)
  const before = storage.getItem(key)
  assert.throws(() => writeStoryBackups(storage, key, { ...state, auto: { ...auto, draft: { ...auto.draft, body: 'x'.repeat(2_500_001) } } }))
  assert.equal(storage.getItem(key), before)
})

test('blocked storage and quota failures are surfaced and preserve the last confirmed backup', () => {
  const storage = memoryStorage()
  const state = { ...emptyStoryBackups(), auto: backup() }
  writeStoryBackups(storage, key, state)
  const before = storage.getItem(key)
  assert.throws(() => readStoryBackups({ getItem() { throw new Error('SecurityError') } }, key))
  assert.throws(() => writeStoryBackups({ setItem() { throw new Error('QuotaExceededError') } }, key, state))
  assert.equal(storage.getItem(key), before)
})
