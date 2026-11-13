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
