import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { preparePhoto, MAX_BYTES } from '../photos.mjs'
import { processStaged } from '../process-staged.mjs'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const png = () => sharp({ create: { width: 2, height: 3, channels: 4, background: '#abcdef' } }).png().toBuffer()


test('decodes and normalizes public images, strips EXIF and uses deterministic paths', async () => {
  const input = await sharp(await png()).withMetadata({ exif: { IFD0: { Artist: 'Synthetic fixture' } } }).png().toBuffer()
  const photo = await preparePhoto(input, 'image/png', 'profiles/kenji/new')
  assert.match(photo.path, /^assets\/profiles\/kenji\/new\/[a-f0-9]{64}\.webp$/)
  assert.deepEqual(await preparePhoto(input, 'image/png', 'profiles/kenji/new'), photo)
  const meta = await sharp(Buffer.from(photo.content, 'base64')).metadata()
  assert.equal(meta.width, 2)
  assert.equal(meta.height, 3)
  assert.equal(meta.exif, undefined)
  assert.equal(meta.xmp, undefined)
})

test('rejects SVG/HTML, mismatched MIME, truncation, oversize, oversized dimensions and path traversal', async () => {
  const input = await png()
  for (const [bytes, mime, target] of [
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png', 'gallery'],
    [input, 'image/jpeg', 'gallery'], [input.subarray(0, 24), 'image/png', 'gallery'],
    [Buffer.alloc(MAX_BYTES + 1), 'image/png', 'gallery'], [input, 'image/png', '../private'],
    [await sharp({ create: { width: 4097, height: 1, channels: 3, background: 'white' } }).png().toBuffer(), 'image/png', 'gallery'],
  ]) await assert.rejects(preparePhoto(bytes, mime, target))
})

test('only fully decoded staged images reach public assets; rejects are removed without publication', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kirari-staging-'))
  const directory = join(root, 'staging/gallery')
  await mkdir(directory, { recursive: true })
  const input = await png(), name = `${'a'.repeat(64)}.png`, bad = `${'b'.repeat(64)}.png`
  await writeFile(join(directory, name), input)
  await writeFile(join(directory, bad), input.subarray(0, 24))
  const photo = await preparePhoto(input, 'image/png', 'gallery')
  assert.deepEqual(await processStaged(root), { accepted: 1, rejected: 1 })
  assert.deepEqual(await readFile(join(root, photo.path)), Buffer.from(photo.content, 'base64'))
  await assert.rejects(readFile(join(directory, name)))
  await assert.rejects(readFile(join(directory, bad)))
  await writeFile(join(directory, name), input)
  assert.deepEqual(await processStaged(root), { accepted: 1, rejected: 0 })
})

test('atomic upload bundles preserve copyright separately from stripped image metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kirari-credit-'))
  const directory = join(root, 'staging/gallery')
  await mkdir(directory, { recursive: true })
  const input = await png()
  const payload = { version: 1, mime: 'image/png', credit: '테스트 작가', image: input.toString('base64') }
  await writeFile(join(directory, `${'c'.repeat(64)}.json`), JSON.stringify(payload))
  await writeFile(join(directory, `${'d'.repeat(64)}.json`), JSON.stringify({ ...payload, credit: '' }))
  await writeFile(join(directory, `${'e'.repeat(64)}.json`), JSON.stringify({ ...payload, mime: 'image/svg+xml' }))
  assert.deepEqual(await processStaged(root), { accepted: 1, rejected: 2 })
  const photo = await preparePhoto(input, 'image/png', 'gallery')
  assert.deepEqual(JSON.parse(await readFile(join(root, photo.path.replace(/\.webp$/, '.json')), 'utf8')), { credit: '테스트 작가' })
})
