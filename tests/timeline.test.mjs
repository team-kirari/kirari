import test from 'node:test'
import assert from 'node:assert/strict'
import { visibleTimeline, moveTimelineEvent, timelineInsertionIndex, timelineOrderUpdates, parseTimelineEvent, timelineReadError, timelineBodyBlocks } from '../src/lib/timeline.ts'
import { timelineFixture } from './fixtures/timeline.mjs'

const payload = (item = timelineFixture) => { const { id, ...data } = item; return { id, data } }

test('an empty or fully deleted server timeline never restores built-in events', () => {
  assert.deepEqual(visibleTimeline([]), [])
  assert.deepEqual(visibleTimeline([{ ...timelineFixture, deleted: true }]), [])
  const item = { ...timelineFixture, title: '서버에서 수정한 제목', body: '서버 본문', revision: 5 }
  assert.deepEqual(visibleTimeline([item]), [item])
})

test('only live server events appear in chronological order without mutating input', () => {
  const item = { ...timelineFixture, id: 'later', month: 11 }
  const sameMonth = { ...timelineFixture, id: 'day', day: 3 }
  const earlier = { ...timelineFixture, id: 'earlier', year: 2049 }
  const removed = { ...timelineFixture, id: 'removed', deleted: true }
  const input = [item, removed, sameMonth, timelineFixture, earlier]
  const before = structuredClone(input)
  assert.deepEqual(visibleTimeline(input).map(event => event.id), ['earlier', 'test-event', 'day', 'later'])
  assert.deepEqual(input, before)
})

test('subtitles preserve plain text, unsafe links and HTML without interpreting markup', () => {
  assert.deepEqual(timelineBodyBlocks('## 9월\r\n\r\n본문\n\n## <img src=x onerror=alert(1)>\n\njavascript:alert(1)'), [
    { subtitle: true, text: '9월' }, { subtitle: false, text: '본문' },
    { subtitle: true, text: '<img src=x onerror=alert(1)>' }, { subtitle: false, text: 'javascript:alert(1)' },
  ])
})

test('read failures explain the problem without promising fallback content or echoing remote messages', () => {
  assert.match(timelineReadError({ code: 'permission-denied' }), /firestore.rules/)
  assert.match(timelineReadError({ code: 'unavailable' }), /네트워크/)
  assert.match(timelineReadError({ code: 'invalid-data' }), /형식/)
  assert.equal(timelineReadError({ message: 'sensitive' }).includes('sensitive'), false)
  assert.equal(timelineReadError({}).includes('기본 타임라인'), false)
})

test('invalid dates, malformed fields and path IDs cannot enter the timeline', () => {
  const { id, data } = payload()
  for (const bad of [{ year: 0 }, { year: 10000 }, { year: 2050, month: 2, day: 29 }, { month: 13 }, { month: 4, day: 31 }, { day: -1 }, { title: ' ' }, { body: '' }, { body: 'a'.repeat(12001) }, { revision: 1.5 }, { deleted: 'true' }, { src: 'javascript:alert(1)' }]) assert.equal(parseTimelineEvent(id, { ...data, ...bad }), null)
  assert.equal(parseTimelineEvent('../private', data), null)
  assert.ok(parseTimelineEvent(id, { ...data, year: 2048, month: 2, day: 29 }))
  assert.ok(parseTimelineEvent(id, { ...data, title: '<script>alert(1)</script>' }))
})


test('manual order overrides dates and leaves newly unranked events at the end', () => {
  const first = { ...timelineFixture, id: 'first', year: 2052, order: 0 }
  const second = { ...timelineFixture, id: 'second', year: 2049, order: 1 }
  assert.deepEqual(visibleTimeline([second, timelineFixture, first]).map(item => item.id), ['first', 'second', timelineFixture.id])
  assert.deepEqual(visibleTimeline([second, { ...first, deleted: true }]), [second])
})

test('reordering uses IDs even for equal dates, preserves content and does not mutate input', () => {
  const input = ['a', 'b', 'c'].map(id => ({ ...timelineFixture, id }))
  const before = structuredClone(input)
  const moved = moveTimelineEvent(input, 'c', 'a')
  assert.deepEqual(moved.map(item => item.id), ['c', 'a', 'b'])
  assert.deepEqual(moveTimelineEvent(moved, 'c', 'b'), input)
  assert.equal(moveTimelineEvent(input, 'missing', 'a'), input)
  assert.equal(moveTimelineEvent(input, 'a', 'a'), input)
  const updates = timelineOrderUpdates(moved)
  assert.deepEqual(updates.map(item => item.payload.order), [0, 1, 2])
  assert.ok(updates.every(item => item.payload.revision === timelineFixture.revision + 1 && item.payload.body === timelineFixture.body))
  const persisted = updates.map(({ id, payload }) => parseTimelineEvent(id, payload))
  assert.deepEqual(visibleTimeline(persisted).map(item => item.id), ['c', 'a', 'b'])
  assert.deepEqual(input, before)
  for (const invalid of [[], [input[0], input[0]], [{ ...input[0], deleted: true }], Array.from({ length: 201 }, (_, i) => ({ ...input[0], id: String(i) }))]) assert.throws(() => timelineOrderUpdates(invalid), /invalid-timeline/)
})

test('legacy records remain valid while malformed order values are rejected', () => {
  const { id, data } = payload()
  assert.ok(parseTimelineEvent(id, data))
  assert.ok(parseTimelineEvent(id, { ...data, order: 0 }))
  assert.ok(parseTimelineEvent(id, { ...data, order: 1000000000 }))
  for (const order of [-1, 1.5, NaN, Infinity, '0', null, undefined, 1000000001]) assert.equal(parseTimelineEvent(id, { ...data, order }), null)
})


test('drag insertion follows row midpoints across gaps and supports first and last slots', () => {
  const rows = [{ top: 100, height: 60 }, { top: 168, height: 100 }]
  assert.equal(timelineInsertionIndex(rows, 80), 0)
  assert.equal(timelineInsertionIndex(rows, 129), 0)
  assert.equal(timelineInsertionIndex(rows, 130), 1)
  assert.equal(timelineInsertionIndex(rows, 164), 1)
  assert.equal(timelineInsertionIndex(rows, 217), 1)
  assert.equal(timelineInsertionIndex(rows, 218), 2)
  assert.equal(timelineInsertionIndex(rows, 400), 2)
  assert.equal(timelineInsertionIndex([], 100), 0)
  // Dropping uses the slot in the list with the source excluded, in either direction.
  const items = ['a', 'b', 'c'].map(id => ({ ...timelineFixture, id }))
  const slot = timelineInsertionIndex(rows, 400)
  assert.deepEqual(moveTimelineEvent(items, 'a', items[slot].id).map(item => item.id), ['b', 'c', 'a'])
  assert.deepEqual(moveTimelineEvent(items, 'c', items[0].id).map(item => item.id), ['c', 'a', 'b'])
  // After scrolling, the same stationary pointer sees the newly revealed insertion slot.
  assert.equal(timelineInsertionIndex(rows.map(row => ({ ...row, top: row.top - 100 })), 129), 2)
})


test('milestones preserve optional flags and plain-text subtitles through reordering', () => {
  const { id, data } = payload()
  assert.ok(parseTimelineEvent(id, data))
  const subtitle = '<img src=x onerror=alert(1)>'
  const event = parseTimelineEvent(id, { ...data, highlighted: true, subtitle })
  assert.equal(event.highlighted, true)
  assert.equal(event.subtitle, subtitle)
  const [update] = timelineOrderUpdates([event])
  assert.equal(update.payload.highlighted, true)
  assert.equal(update.payload.subtitle, subtitle)
  assert.ok(parseTimelineEvent(id, { ...data, highlighted: false, subtitle: '' }))
  assert.ok(parseTimelineEvent(id, { ...data, subtitle: 'a'.repeat(40) }))
  for (const bad of [{ highlighted: 'true' }, { highlighted: null }, { subtitle: 42 }, { subtitle: null }, { subtitle: 'a'.repeat(41) }]) {
    assert.equal(parseTimelineEvent(id, { ...data, ...bad }), null)
  }
})
