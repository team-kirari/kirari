import test from 'node:test'
import assert from 'node:assert/strict'
import { collectPhotoTags, photoUploadMetadata } from '../src/lib/photo-upload.ts'

test('each selected photo retains its own filename, album, tags and credit', () => {
  const a = { credit: '작가 A', album: '첫 앨범', tags: ['켄지'], tagInput: '#키요, 켄지' }
  const b = { credit: '작가 B', album: '다른 앨범', tags: [], tagInput: '움짤' }
  assert.deepEqual(photoUploadMetadata('first.png', a), { title: 'first.png', credit: '작가 A', album: '첫 앨범', tags: ['켄지', '키요'] })
  assert.deepEqual(photoUploadMetadata('second.apng', b), { title: 'second.apng', credit: '작가 B', album: '다른 앨범', tags: ['움짤'] })
  assert.deepEqual(a.tags, ['켄지'])
  assert.equal(photoUploadMetadata('<img onerror=alert(1)>.png', a).title, '<img onerror=alert(1)>.png')
  assert.equal(photoUploadMetadata('bad\nname.png', a).title, 'badname.png')
  assert.throws(() => photoUploadMetadata('a.png', { ...a, credit: '' }))
  assert.throws(() => photoUploadMetadata('a.png', { ...a, album: 'x'.repeat(81) }))
  assert.throws(() => collectPhotoTags([], 'bad\ntag'))
  assert.throws(() => collectPhotoTags([], Array.from({ length: 21 }, (_, i) => `tag${i}`).join(',')))
})
