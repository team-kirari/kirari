import test from 'node:test'
import assert from 'node:assert/strict'
import { addLike, emptyLikes, LIKE_STORAGE_KEY, readLikes, resetLikes } from '../src/lib/likes.ts'
import { seoulDate } from '../src/lib/dday.ts'

function memoryStorage(initial = null) {
  let value = initial
  return {
    getItem: () => value,
    setItem: (key, next) => { assert.equal(key, LIKE_STORAGE_KEY); value = next },
    removeItem: key => { assert.equal(key, LIKE_STORAGE_KEY); value = null },
  }
}

test('each click increments the saved total, with a persistent five-per-day limit', () => {
  const storage = memoryStorage()
  assert.deepEqual(readLikes(storage, '2026-11-04'), emptyLikes('2026-11-04'))
  for (let i = 1; i <= 5; i++) {
    assert.deepEqual(addLike(storage, '2026-11-04'), { version: 1, total: i, day: '2026-11-04', used: i })
  }
  assert.equal(addLike(storage, '2026-11-04').total, 5)
  assert.equal(readLikes(storage, '2026-11-04').used, 5)
})

test('Seoul midnight resets the allowance while retaining the accumulated count', () => {
  const storage = memoryStorage()
  const before = seoulDate(new Date('2026-11-04T14:59:59Z'))
  const after = seoulDate(new Date('2026-11-04T15:00:00Z'))
  for (let i = 0; i < 5; i++) addLike(storage, before)
  assert.deepEqual(readLikes(storage, after), { version: 1, total: 5, day: after, used: 0 })
  assert.equal(addLike(storage, after).total, 6)
  assert.equal(readLikes(storage, after).used, 1)
})

test('separate readers use the latest stored allowance and reset removes the record', () => {
  const storage = memoryStorage()
  for (let i = 0; i < 4; i++) addLike(storage, '2026-11-04')
  assert.equal(readLikes(storage, '2026-11-04').used, 4)
  addLike(storage, '2026-11-04')
  assert.equal(addLike(storage, '2026-11-04').total, 5)
  assert.deepEqual(resetLikes(storage, '2026-11-04'), emptyLikes('2026-11-04'))
  assert.equal(storage.getItem(LIKE_STORAGE_KEY), null)
})

test('corrupt and untrusted saved data is rejected without overwriting it', () => {
  const base = { version: 1, total: 5, used: 5, day: '2026-11-04' }
  const invalid = ['bad json', 'null', '[]', 'x'.repeat(257), ...[
    { version: 2 }, { total: -1 }, { total: 1.5 }, { total: '5' }, { total: 3 },
    { total: Number.MAX_SAFE_INTEGER + 1 }, { used: 6 }, { used: -1 }, { used: 1.5 },
    { day: '2026-02-30' }, { day: '<script>' },
  ].map(patch => JSON.stringify({ ...base, ...patch }))]
  for (const raw of invalid) {
    const storage = memoryStorage(raw)
    assert.throws(() => addLike(storage, '2026-11-04'))
    assert.equal(storage.getItem(LIKE_STORAGE_KEY), raw)
  }
})

test('storage failures propagate and a failed write does not count as saved', () => {
  const storage = memoryStorage()
  storage.setItem = () => { throw new Error('quota exceeded') }
  assert.throws(() => addLike(storage, '2026-11-04'), /quota/)
  assert.equal(readLikes(storage, '2026-11-04').total, 0)
  storage.getItem = () => { throw new Error('storage blocked') }
  assert.throws(() => readLikes(storage, '2026-11-04'), /blocked/)
  storage.removeItem = () => { throw new Error('storage blocked') }
  assert.throws(() => resetLikes(storage, '2026-11-04'), /blocked/)
})
