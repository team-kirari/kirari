import test from 'node:test'
import assert from 'node:assert/strict'
import { searchRecords, searchExcerpt } from '../src/lib/search.ts'

const sources = {
  gallery: [{ id: 'photo', title: '합성 그림', album: '합성 봄', tags: ['켄지'], credit: 'Sample Artist', src: '/image.png' }],
  stories: [{ id: 'story', title: '합성 이야기', author: 'Sample Author', writtenOn: '2026-11-18', protected: true, body: '검색하면 안 되는 비밀' }],
  logs: [{ id: 'log', title: '합성 로그', logDate: '2026-10-01', preview: 'https://example.com/secret.png', body: '검색하면 안 되는 비밀' }],
}

test('global search covers exactly gallery, stories and logs with unique destinations', () => {
  const results = searchRecords('합성', sources)
  assert.deepEqual(results.map(item => item.category), ['갤러리', '이야기', '로그'])
  assert.deepEqual(results.map(item => item.href), ['#gallery?item=photo', '#story?story=story', '#trpg?log=log'])
  assert.equal(searchRecords('켄지', sources)[0].category, '갤러리')
  assert.equal(searchRecords('봄', sources)[0].category, '갤러리')
  assert.equal(searchRecords('sample author', sources)[0].category, '이야기')
  assert.equal(searchRecords('2026-10', sources)[0].category, '로그')
})

test('normalizes case, Unicode and whitespace, matches all words, and ignores empty input', () => {
  assert.equal(searchRecords('  ＳＡＭＰＬＥ   artist ', sources)[0].id, 'photo')
  assert.equal(searchRecords('켄지', sources)[0].id, 'photo')
  assert.deepEqual(searchRecords('sample missing', sources), [])
  assert.deepEqual(searchRecords('  \n ', sources), [])
  assert.deepEqual(searchRecords('x'.repeat(10000), sources), [])
})

test('locked bodies, preview URLs and unexpected fields never enter search results', () => {
  assert.deepEqual(searchRecords('비밀', sources), [])
  assert.deepEqual(searchRecords('secret.png', sources), [])
  const results = searchRecords('합성', sources)
  assert.ok(results.every(item => !('body' in item) && !('preview' in item)))
})

test('HTML and dangerous URL queries remain plain strings and never become result links', () => {
  const hostile = { ...sources, stories: [{ id: 'javascript:alert(1)', title: '<script>alert(1)</script>', author: '', protected: false }] }
  const [result] = searchRecords('<script>', hostile)
  assert.equal(result.title, '<script>alert(1)</script>')
  assert.equal(result.href, '#story?story=javascript%3Aalert(1)')
  assert.deepEqual(searchRecords('javascript:', sources), [])
})

test('excerpts show nearby matching text and keep long metadata compact', () => {
  const excerpt = searchExcerpt('앞'.repeat(250) + 'needle' + '뒤'.repeat(250), 'needle')
  assert.ok(excerpt.includes('needle'))
  assert.ok(excerpt.startsWith('…') && excerpt.endsWith('…'))
  assert.ok(excerpt.length <= 182)
})


test('gallery titles are excluded while tags, albums and credits remain searchable', () => {
  assert.deepEqual(searchRecords('그림', sources), [])
  for (const query of ['켄지', '봄', 'artist']) assert.equal(searchRecords(query, sources)[0].id, 'photo')
  assert.equal(searchRecords('이야기', sources)[0].id, 'story')
  assert.equal(searchRecords('로그', sources)[0].id, 'log')
})
