import test from 'node:test'
import assert from 'node:assert/strict'
import { visibleTimeline, parseTimelineEvent, timelineReadError, timelineBodyBlocks } from '../src/lib/timeline.ts'
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
