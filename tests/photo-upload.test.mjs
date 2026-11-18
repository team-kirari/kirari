import test from 'node:test'
import assert from 'node:assert/strict'
import { collectPhotoTags, photoUploadMetadata, uploadPhotoBatch } from '../src/lib/photo-upload.ts'

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

test('batch pairs each photo with its metadata, processes sequentially and retries only failures', async () => {
  const jobs = [
    { id: 'a', file: new Blob(['first']), metadata: photoUploadMetadata('a.png', { credit: 'A', album: 'A', tags: [], tagInput: 'a' }) },
    { id: 'b', file: new Blob(['second']), metadata: photoUploadMetadata('b.apng', { credit: 'B', album: 'B', tags: [], tagInput: 'b' }) },
    { id: 'c', file: new Blob(['third']), metadata: photoUploadMetadata('c.webp', { credit: 'C', album: 'C', tags: [], tagInput: '' }) },
  ]
  const results = new Map(), calls = []
  let active = 0
  await uploadPhotoBatch(jobs, async job => {
    assert.equal(active++, 0)
    calls.push([job.id, await job.file.text(), job.metadata.credit, job.metadata.album])
    active--
    if (job.id === 'b') throw new Error('offline')
    return job.id === 'c'
  }, (job, result) => results.set(job.id, result))
  assert.deepEqual(calls, [['a', 'first', 'A', 'A'], ['b', 'second', 'B', 'B'], ['c', 'third', 'C', 'C']])
  assert.equal(results.get('a').status, 'staged')
  assert.deepEqual(results.get('b'), { status: 'error', error: 'offline' })
  assert.equal(results.get('c').status, 'duplicate')
  const retried = []
  await uploadPhotoBatch(jobs.filter(job => results.get(job.id).status === 'error'), async job => { retried.push(job.id); return false }, (job, result) => results.set(job.id, result))
  assert.deepEqual(retried, ['b'])
  assert.equal(results.get('b').status, 'staged')
})
