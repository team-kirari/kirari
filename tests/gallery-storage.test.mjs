import test from 'node:test'
import assert from 'node:assert/strict'
import { galleryGroups } from '../src/lib/gallery-storage.ts'
import { copyrightLabel, defaultGalleryMetadata, parseGalleryMetadata } from '../src/lib/gallery-catalog.ts'

const metadata = { ...defaultGalleryMetadata, title: '그림', tags: ['켄지', '키요'], album: '첫 데이트', revision: 1 }
test('tag and album groups reflect registered metadata and include unfiled albums', () => {
  const items = [{ ...metadata }, { ...metadata, tags: ['키요', '페어'], album: '' }]
  assert.deepEqual(new Set(galleryGroups(items, '태그')), new Set(['켄지', '키요', '페어']))
  assert.deepEqual(new Set(galleryGroups(items, '앨범')), new Set(['첫 데이트', '미분류']))
  assert.deepEqual(galleryGroups([], '태그'), [])
})
test('catalog rejects malformed, excessive and executable URL fields', () => {
  assert.deepEqual(parseGalleryMetadata(metadata), metadata)
  for (const bad of [{ title: ' ' }, { tags: ['태그', '태그'] }, { tags: ['x'.repeat(41)] }, { tags: Array(21).fill('x') }, { album: 42 }, { deleted: 1 }, { revision: 0 }, { src: 'javascript:alert(1)' }]) assert.equal(parseGalleryMetadata({ ...metadata, ...bad }), null)
  assert.ok(parseGalleryMetadata({ ...metadata, title: '<img src=x onerror=alert(1)>' }))
})

test('copyright labels wrap names once and leave absent credits empty', () => {
  assert.equal(copyrightLabel('  작가  '), 'ⓒ 작가 님')
  assert.equal(copyrightLabel('ⓒ 작가 님'), 'ⓒ 작가 님')
  assert.equal(copyrightLabel(''), '')
  assert.equal(copyrightLabel('<script>'), 'ⓒ <script> 님')
})
