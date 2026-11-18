import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { pngChunk } from '../png.mjs'
import { preparePhoto } from '../photos.mjs'
import { processStaged } from '../process-staged.mjs'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function fixture({ corruptFrame = false, badSequence = false, metadata = true } = {}) {
  const frames = []
  for (const color of ['red', 'blue']) {
    const png = await sharp({ create: { width: 2, height: 3, channels: 4, background: color } }).png().toBuffer()
    const chunks = []
    for (let offset = 8; offset < png.length;) {
      const size = png.readUInt32BE(offset)
      chunks.push({ type: png.toString('ascii', offset + 4, offset + 8), data: png.subarray(offset + 8, offset + 8 + size) })
      offset += size + 12
    }
    frames.push(chunks)
  }
  const control = Buffer.alloc(8); control.writeUInt32BE(2)
  const frame = sequence => {
    const data = Buffer.alloc(26); data.writeUInt32BE(sequence); data.writeUInt32BE(2, 4); data.writeUInt32BE(3, 8); data.writeUInt16BE(1, 20); data.writeUInt16BE(10, 22)
    return pngChunk('fcTL', data)
  }
  const data = Buffer.concat(frames[1].filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data))
  const sequence = Buffer.alloc(4); sequence.writeUInt32BE(badSequence ? 99 : 2)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', frames[0][0].data),
    ...(metadata ? [pngChunk('tEXt', Buffer.from('Comment\0synthetic private metadata'))] : []),
    pngChunk('acTL', control), frame(0),
    ...frames[0].filter(chunk => chunk.type === 'IDAT').map(chunk => pngChunk('IDAT', chunk.data)),
    frame(1), pngChunk('fdAT', Buffer.concat([sequence, corruptFrame ? Buffer.from('broken compressed pixels') : data])),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

test('APNG preserves both frames, timing and loop while stripping metadata', async () => {
  const photo = await preparePhoto(await fixture(), 'image/apng', 'gallery')
  assert.match(photo.path, /\.png$/)
  assert.deepEqual(Buffer.from(photo.content, 'base64'), await fixture({ metadata: false }))
  assert.deepEqual(await preparePhoto(await fixture(), 'image/png', 'gallery'), photo)
})

test('APNG rejects corrupt later frame, sequence, checksum and truncated data', async () => {
  for (const input of [await fixture({ corruptFrame: true }), await fixture({ badSequence: true }), (await fixture()).subarray(0, -4)]) {
    await assert.rejects(preparePhoto(input, 'image/png', 'gallery'))
  }
  const bad = await fixture(); bad[bad.length - 1] ^= 1
  await assert.rejects(preparePhoto(bad, 'image/apng', 'gallery'))
})

test('APNG staged bundle publishes PNG with matching album sidecar', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kirari-apng-'))
  await mkdir(join(root, 'staging/gallery'), { recursive: true })
  const input = await fixture(), metadata = { title: 'animation.apng', album: '움직이는 그림', tags: [], credit: '테스트' }
  await writeFile(join(root, 'staging/gallery', `${'a'.repeat(64)}.json`), JSON.stringify({ version: 1, mime: 'image/apng', credit: metadata.credit, metadata, image: input.toString('base64') }))
  assert.deepEqual(await processStaged(root), { accepted: 1, rejected: 0 })
  const photo = await preparePhoto(input, 'image/apng', 'gallery')
  assert.deepEqual(JSON.parse(await readFile(join(root, photo.path.replace(/\.png$/, '.json')), 'utf8')), metadata)
})

test('APNG above 5MB is accepted and oversized ancillary metadata is stripped', async () => {
  const input = await fixture(), metadata = pngChunk('tEXt', Buffer.concat([Buffer.from('Comment\0'), Buffer.alloc(6 * 1024 * 1024, 97)]))
  const large = Buffer.concat([input.subarray(0, 33), metadata, input.subarray(33)])
  const photo = await preparePhoto(large, 'image/apng', 'gallery')
  assert.deepEqual(Buffer.from(photo.content, 'base64'), await fixture({ metadata: false }))
})
