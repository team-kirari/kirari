import test from 'node:test'
import assert from 'node:assert/strict'
import { addLike, emptyLikes, LIKE_STORAGE_KEY, likeLoadErrorMessage, parseLikeTotal, readLikes } from '../src/lib/likes.ts'
import { seoulDate } from '../src/lib/dday.ts'

function memoryStorage(initial = null) {
  let value = initial
  return {
    getItem: () => value,
    setItem: (key, next) => { assert.equal(key, LIKE_STORAGE_KEY); value = next },
  }
}

test('load errors distinguish configuration, permissions, database and network without exposing raw details', () => {
  assert.match(likeLoadErrorMessage({ code: 'likes/configuration-missing' }), /npm run dev/)
  assert.match(likeLoadErrorMessage({ code: 'permission-denied' }), /permission-denied/)
  assert.match(likeLoadErrorMessage({ code: 'not-found' }), /not-found/)
  assert.match(likeLoadErrorMessage({ code: 'unavailable' }), /인터넷/)
  assert.match(likeLoadErrorMessage({ code: 'deadline-exceeded' }), /인터넷/)
  assert.match(likeLoadErrorMessage({ code: 'resource-exhausted' }), /사용 한도/)
  for (const error of [null, 'private-detail', { code: 'private-detail', message: 'private-detail' }]) {
    assert.equal(likeLoadErrorMessage(error).includes('private-detail'), false)
  }
})

test('five daily clicks each issue one remote increment, with no remote reads', async () => {
  const storage = memoryStorage()
  let writes = 0
  const increment = async () => { writes++ }
  assert.deepEqual(readLikes(storage, '2026-11-04'), emptyLikes('2026-11-04'))
  for (let i = 1; i <= 5; i++) {
    const result = await addLike(storage, '2026-11-04', increment)
    assert.equal(result.added, true)
    assert.equal(result.count.used, i)
  }
  assert.equal((await addLike(storage, '2026-11-04', increment)).added, false)
  assert.equal(writes, 5)
  assert.equal('total' in JSON.parse(storage.getItem()), false)
})

test('Seoul midnight renews allowance and legacy totals are never uploaded', async () => {
  const before = seoulDate(new Date('2026-11-04T14:59:59Z'))
  const after = seoulDate(new Date('2026-11-04T15:00:00Z'))
  const storage = memoryStorage(JSON.stringify({ version: 1, total: 100, day: before, used: 5 }))
  assert.equal(readLikes(storage, before).used, 5)
  assert.deepEqual(readLikes(storage, after), emptyLikes(after))
  let writes = 0
  await addLike(storage, after, async () => { writes++ })
  assert.equal(writes, 1)
  assert.equal(readLikes(storage, after).used, 1)
})

test('invalid local data cannot cause remote writes', async () => {
  const base = { version: 2, used: 5, day: '2026-11-04' }
  const invalid = ['bad json', 'null', '[]', 'x'.repeat(257), ...[
    { version: 3 }, { used: 6 }, { used: -1 }, { used: 1.5 }, { used: '1' },
    { day: '2026-02-30' }, { day: '<script>' }, { version: 1, total: -1 },
  ].map(patch => JSON.stringify({ ...base, ...patch }))]
  for (const raw of invalid) {
    const storage = memoryStorage(raw)
    await assert.rejects(addLike(storage, '2026-11-04', async () => assert.fail('must not write')))
    assert.equal(storage.getItem(), raw)
  }
})

test('remote failures do not consume allowance; blocked storage prevents writes', async () => {
  const storage = memoryStorage()
  await assert.rejects(addLike(storage, '2026-11-04', async () => { throw new Error('offline') }), /offline/)
  assert.equal(readLikes(storage, '2026-11-04').used, 0)
  storage.setItem = () => { throw new Error('quota exceeded') }
  await assert.rejects(addLike(storage, '2026-11-04', async () => assert.fail('must not write')), /quota/)
})

test('storage failure after server success preserves the accepted result without retrying', async () => {
  const storage = memoryStorage()
  let writes = 0
  const result = await addLike(storage, '2026-11-04', async () => {
    writes++
    storage.setItem = () => { throw new Error('quota exceeded') }
  })
  assert.equal(writes, 1)
  assert.equal(result.added, true)
  assert.equal(result.storageFailed, true)
  assert.equal(result.count.used, 1)
})

test('missing remote document starts at zero; malformed remote totals fail closed', () => {
  assert.equal(parseLikeTotal(undefined), 0)
  assert.equal(parseLikeTotal({ total: 123 }), 123)
  for (const value of [null, [], {}, { total: -1 }, { total: '5' }, { total: 0.5 }, { total: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => parseLikeTotal(value))
  }
})
