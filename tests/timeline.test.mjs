import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultTimeline, mergeTimeline, parseTimelineEvent, timelineReadError, timelineBodyBlocks } from '../src/lib/timeline.ts'

const payload = (item = defaultTimeline[0]) => { const { id, ...data } = item; return { id, data: { ...data, revision: 1 } } }
test('six events keep multi-month stories together and preserve chronology', () => {
  const events = mergeTimeline([])
  assert.equal(events.length, 6)
  assert.deepEqual(events.map(item => [item.year, item.month, item.day]), [[2049, 9, 0], [2050, 9, 0], [2050, 10, 31], [2050, 11, 0], [2050, 12, 0], [2050, 12, 0]])
  assert.equal(events[0].dateLabel, '9–10월')
  assert.deepEqual(timelineBodyBlocks(events[0].body).filter(block => block.subtitle).map(block => block.text), ['9월', '10월'])
  assert.match(events[0].body, /정식 파트너/)
  assert.equal(events.at(-1).title, '첫 데이트')
  for (const item of events) { const { id, data } = payload(item); assert.ok(parseTimelineEvent(id, data)) }
})
test('legacy month edits merge once; canonical edits and deletion override both months', () => {
  const legacy = { ...defaultTimeline[0], id: 'refrain-october', month: 10, title: '가을비의 리프레인', body: '수정된 10월', revision: 3 }
  const events = mergeTimeline([legacy])
  assert.equal(events.length, 6)
  assert.match(events[0].body, /수정된 10월/)
  assert.equal(events[0].revision, 0) // A new combined document, not the legacy revision.
  const saved = { ...events[0], body: '통합 편집', revision: 1 }
  assert.equal(mergeTimeline([saved, legacy])[0].body, '통합 편집')
  assert.equal(mergeTimeline([{ ...saved, deleted: true }, legacy]).some(item => item.id === saved.id), false)
  assert.ok(parseTimelineEvent(saved.id, payload({ ...saved, dateLabel: '2049년 12월–2050년 2월' }).data))
})
test('subtitles preserve plain text, unsafe links and HTML without interpreting markup', () => {
  assert.deepEqual(timelineBodyBlocks('## 9월\r\n\r\n본문\n\n## <img src=x onerror=alert(1)>\n\njavascript:alert(1)'), [
    { subtitle: true, text: '9월' }, { subtitle: false, text: '본문' },
    { subtitle: true, text: '<img src=x onerror=alert(1)>' }, { subtitle: false, text: 'javascript:alert(1)' },
  ])
})
test('read failures explain permission, network and invalid data without echoing remote messages', () => {
  assert.match(timelineReadError({ code: 'permission-denied' }), /firestore.rules/)
  assert.match(timelineReadError({ code: 'unavailable' }), /네트워크/)
  assert.match(timelineReadError({ code: 'invalid-data' }), /형식/)
  assert.equal(timelineReadError({ message: 'sensitive' }).includes('sensitive'), false)
})
test('shared overrides replace seeds, tombstones stay deleted, new events sort by date', () => {
  const first = { ...defaultTimeline[0], title: '수정한 제목', revision: 1 }
  const removed = { ...defaultTimeline[1], deleted: true, revision: 1 }
  const earlier = { ...first, id: 'earlier', year: 2048 }
  const items = mergeTimeline([first, removed, earlier])
  assert.equal(items[0].id, 'earlier')
  assert.equal(items[1].title, '수정한 제목')
  assert.equal(items.some(item => item.id === removed.id), false)
  assert.equal(defaultTimeline[0].revision, 0)
})
test('invalid dates, malformed fields and path IDs cannot enter the timeline', () => {
  const { id, data } = payload()
  for (const bad of [{ year: 0 }, { year: 10000 }, { year: 2050, month: 2, day: 29 }, { month: 13 }, { month: 4, day: 31 }, { day: -1 }, { title: ' ' }, { body: '' }, { body: 'a'.repeat(12001) }, { revision: 1.5 }, { deleted: 'true' }, { src: 'javascript:alert(1)' }]) assert.equal(parseTimelineEvent(id, { ...data, ...bad }), null)
  assert.equal(parseTimelineEvent('../private', data), null)
  assert.ok(parseTimelineEvent(id, { ...data, year: 2048, month: 2, day: 29 }))
  assert.ok(parseTimelineEvent(id, { ...data, title: '<script>alert(1)</script>' })) // Text fields are rendered as React text.
})
