import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { preparePhoto } from '../photos.mjs'
import { processStaged } from '../process-staged.mjs'
import { writeGalleryManifest } from '../gallery-manifest.mjs'
import { parseGalleryManifest } from '../../src/lib/gallery-manifest.ts'

test('pipeline publishes validated gallery outputs and excludes staging, originals and profiles', async t => {
  const root = await mkdtemp(join(tmpdir(), 'kirari-gallery-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'staging/gallery'), { recursive: true })
  await mkdir(join(root, 'assets/gallery'), { recursive: true })
  const input = await sharp({ create: { width: 2, height: 3, channels: 4, background: 'pink' } }).png().toBuffer()
  const metadata = { title: 'Synthetic photo', tags: ['test'], album: 'Test album', credit: 'Synthetic artist' }
  await writeFile(join(root, 'staging/gallery', `${'a'.repeat(64)}.json`), JSON.stringify({ version: 1, mime: 'image/png', image: input.toString('base64'), credit: metadata.credit, metadata }))
  // A new staged upload cannot appear before decoding and metadata stripping.
  assert.equal(await writeGalleryManifest(root), 0)
  assert.deepEqual(await processStaged(root), { accepted: 1, rejected: 0 })
  await writeFile(join(root, 'assets/gallery/original.png'), input)
  assert.equal(await writeGalleryManifest(root), 1)
  const manifest = JSON.parse(await readFile(join(root, 'public-gallery.json'), 'utf8'))
  const photos = parseGalleryManifest(manifest)
  assert.equal(photos.length, 1)
  const output = await preparePhoto(input, 'image/png', 'gallery')
  const bytes = Buffer.from(output.content, 'base64')
  assert.equal(photos[0].blob, createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'))
  assert.equal(photos[0].album, metadata.album)
  assert.equal(JSON.stringify(manifest).includes('original.png'), false)
  await writeFile(join(root, output.path), input)
  await assert.rejects(writeGalleryManifest(root), /digest/)
  // A failed index rebuild leaves the last good allowlist untouched.
  assert.deepEqual(JSON.parse(await readFile(join(root, 'public-gallery.json'), 'utf8')), manifest)
})
