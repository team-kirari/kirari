import test from 'node:test'
import assert from 'node:assert/strict'
import { galleryGroups } from '../src/lib/gallery-storage.ts'
import { copyrightLabel, defaultGalleryMetadata, parseGalleryMetadata, parsePhotoMetadata } from '../src/lib/gallery-catalog.ts'

const metadata = { ...defaultGalleryMetadata, title: '그림', tags: ['켄지', '키요'], album: '첫 데이트', revision: 1 }
test('upload metadata preserves plain text, accepts legacy credits and rejects malformed public sidecars', () => {
  const fields = { title: '<img src=x onerror=alert(1)>', tags: ['켄지', 'javascript:alert(1)'], album: '첫 데이트', credit: '테스트 작가' }
  assert.deepEqual(parsePhotoMetadata(fields), fields)
  assert.deepEqual(parsePhotoMetadata({ credit: fields.credit }), { title: '등록한 그림', tags: [], album: '', credit: fields.credit })
  for (const bad of [{ title: '' }, { album: 'x'.repeat(81) }, { album: 42 }, { tags: ['a', ' a '] }, { tags: [42] }, { tags: Array.from({ length: 21 }, (_, i) => String(i)) }, { tags: ['x'.repeat(41)] }, { title: 'bad\nheader' }, { private: 'forbidden' }, { credit: '' }]) assert.equal(parsePhotoMetadata({ ...fields, ...bad }), null)
})
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
