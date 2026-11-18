import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { copyPhotos, listPhotos, photoFolders } from '../scripts/photo-assets.mjs'
import { preparePhotoFixtures } from '../scripts/prepare-photo-fixtures.mjs'

test('secret-free checks use only synthetic fixtures and never overwrite a private checkout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kirari-fixtures-'))
  const checkout = join(root, 'kirari-private')
  await preparePhotoFixtures(checkout)
  const files = await listPhotos(join(checkout, 'assets'))
  assert.equal(files.length, 6)
  assert.ok(files.every(file => file.folder === 'img'))
  await assert.rejects(preparePhotoFixtures(checkout), { code: 'EEXIST' })
})

test('imports only allowed raster folders, retains names, mirrors deletions and never copies secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kirari-assets-'))
  const from = join(root, 'from'), to = join(root, 'to')
  for (const folder of photoFolders) await mkdir(join(from, folder), { recursive: true })
  // Header-only synthetic fixture: script intentionally checks headers, server checks full decode.
  const bytes = Buffer.alloc(24)
  bytes.set([137,80,78,71,13,10,26,10]); bytes.write('IHDR', 12); bytes.writeUInt32BE(2, 16); bytes.writeUInt32BE(3, 20)
  await writeFile(join(from, 'profiles/kenji/old/example.png'), bytes)
  await writeFile(join(from, '.env'), 'FAKE_PLACEHOLDER=not-a-secret')
  assert.equal(await copyPhotos(from, to), 1)
  assert.deepEqual(await readFile(join(to, 'profiles/kenji/old/example.png')), bytes)
  await assert.rejects(readFile(join(to, '.env')))
  await assert.rejects(copyPhotos(from, to)) // Export must never overwrite files.
  await writeFile(join(to, 'gallery/removed.png'), bytes)
  assert.equal(await copyPhotos(from, to, { mirror: true }), 1)
  await assert.rejects(readFile(join(to, 'gallery/removed.png')))
  await writeFile(join(from, 'gallery/attack.svg'), '<svg/>')
  await assert.rejects(listPhotos(from))
  await assert.rejects(copyPhotos(from, from))
  await assert.rejects(copyPhotos(from, join(from, 'nested')))
})

test('photo builds accept only bounded copyright sidecars paired with approved image files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kirari-photo-credit-'))
  const from = join(root, 'from'), to = join(root, 'to')
  for (const folder of photoFolders) await mkdir(join(from, folder), { recursive: true })
  const id = 'a'.repeat(64), webp = Buffer.alloc(30)
  webp.write('RIFF', 0); webp.write('WEBPVP8X', 8); webp[24] = 49; webp[27] = 59
  await writeFile(join(from, `gallery/${id}.webp`), webp)
  await writeFile(join(from, `gallery/${id}.json`), JSON.stringify({ credit: '테스트 작가' }))
  const files = await listPhotos(from)
  assert.equal(files.length, 2)
  assert.equal(files.filter(file => file.metadata).length, 1)
  assert.equal(await copyPhotos(from, to), 2)
  assert.deepEqual(JSON.parse(await readFile(join(to, `gallery/${id}.json`), 'utf8')), { credit: '테스트 작가' })
  const metadata = { credit: '테스트 작가', title: '새 그림', tags: ['켄지', '키요'], album: '새 앨범' }
  await writeFile(join(from, `gallery/${id}.json`), JSON.stringify(metadata))
  assert.equal(await copyPhotos(from, to, { mirror: true }), 2)
  assert.deepEqual(JSON.parse(await readFile(join(to, `gallery/${id}.json`), 'utf8')), metadata)
  await writeFile(join(from, `gallery/${id}.json`), JSON.stringify({ credit: '작가', private: 'forbidden' }))
  await assert.rejects(listPhotos(from))
  await writeFile(join(from, `gallery/${id}.json`), JSON.stringify({ credit: '작가' }))
  await writeFile(join(from, `gallery/${'b'.repeat(64)}.json`), JSON.stringify({ credit: 'orphan' }))
  await assert.rejects(listPhotos(from))
})

test('published APNG PNG and its album metadata survive the asset copy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kirari-apng-assets-')), from = join(root, 'from'), to = join(root, 'to')
  for (const folder of photoFolders) await mkdir(join(from, folder), { recursive: true })
  const id = 'c'.repeat(64), bytes = Buffer.alloc(24)
  bytes.set([137,80,78,71,13,10,26,10]); bytes.write('IHDR', 12); bytes.writeUInt32BE(2, 16); bytes.writeUInt32BE(3, 20)
  const metadata = { title: 'animation.apng', album: '앨범', tags: [], credit: '작가' }
  await writeFile(join(from, `gallery/${id}.png`), bytes)
  await writeFile(join(from, `gallery/${id}.json`), JSON.stringify(metadata))
  assert.equal(await copyPhotos(from, to), 2)
  assert.deepEqual(await readFile(join(to, `gallery/${id}.png`)), bytes)
})
