import test from 'node:test'
import assert from 'node:assert/strict'
import { createIllustrationLibrary, selectedProfileImages, inspectImage, pickProfileImage, validateProfileImage } from '../src/lib/profile-images.ts'

test('private checkout images retain filenames and character/version grouping', () => {
  const library = createIllustrationLibrary({
    '../../.local/kirari-private/assets/profiles/kenji/new/기본.png': '/kirari/assets/image.png',
    '../../.local/kirari-private/staging/kenji-new/rejected.png': '/excluded',
  })
  assert.deepEqual(library.kenji.new, [{ name: '기본.png', url: '/kirari/assets/image.png' }])
  assert.equal(library.kiyo.new.length, 0)
})

test('Git illustrations keep both characters and versions separate without a six-photo limit', () => {
  const files = Object.fromEntries(Array.from({ length: 35 }, (_, index) => [`../assets/profiles/kenji/old/${index}.png`, `/kirari/assets/${index}.png`]))
  files['../assets/profiles/kenji/new/new.PNG'] = '/kirari/assets/new.png'
  files['../assets/profiles/kiyo/old/old.jpg'] = '/kirari/assets/old.jpg'
  files['../assets/profiles/kiyo/new/new.webp'] = '/kirari/assets/new.webp'
  for (const path of ['../assets/profiles/kiyo/new/attack.svg', '../assets/profiles/kenji/new/nested/photo.png', '../assets/profiles/kenji/unknown/a.png', '../secrets/a.png']) files[path] = '/excluded'
  const library = createIllustrationLibrary(files)
  assert.equal(library.kenji.old.length, 35)
  assert.deepEqual(library.kenji.new, [{ name: 'new.PNG', url: '/kirari/assets/new.png' }])
  assert.equal(library.kiyo.old.length, 1)
  assert.equal(library.kiyo.new.length, 1)
  assert.deepEqual(createIllustrationLibrary({}).kenji, { old: [], new: [] })
  for (let index = 0; index < 35; index++) assert.equal(pickProfileImage(library.kenji.old, () => (index + .5) / 35), library.kenji.old[index])
})

function png(width = 200, height = 400) {
  const bytes = new Uint8Array(24)
  bytes.set([137,80,78,71,13,10,26,10])
  bytes.set(new TextEncoder().encode('IHDR'), 12)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width); view.setUint32(20, height)
  return bytes
}

test('raster headers provide dimensions before invoking a decoder', () => {
  assert.deepEqual(inspectImage(png(), 'image/png'), { width: 200, height: 400 })
  const gif = new Uint8Array([...Buffer.from('GIF89a'), 10, 0, 20, 0])
  assert.deepEqual(inspectImage(gif, 'image/gif'), { width: 10, height: 20 })
  const jpeg = new Uint8Array([0xff,0xd8,0xff,0xc0,0,8,8,0,30,0,40,3])
  assert.deepEqual(inspectImage(jpeg, 'image/jpeg'), { width: 40, height: 30 })
  const webp = new Uint8Array(30)
  webp.set(Buffer.from('RIFF'), 0); webp.set(Buffer.from('WEBPVP8X'), 8)
  webp[24] = 49; webp[27] = 59
  assert.deepEqual(inspectImage(webp, 'image/webp'), { width: 50, height: 60 })
})

test('WebP lossy and lossless dimension encodings are supported', () => {
  const webp = new Uint8Array(30)
  webp.set(Buffer.from('RIFF'), 0); webp.set(Buffer.from('WEBPVP8 '), 8)
  webp.set([0x9d,1,0x2a,100,0,200,0], 23)
  assert.deepEqual(inspectImage(webp, 'image/webp'), { width: 100, height: 200 })
  webp.set(Buffer.from('VP8L'), 12); webp.set([0x2f,9,0,5,0], 20)
  assert.deepEqual(inspectImage(webp, 'image/webp'), { width: 10, height: 21 })
})

test('SVG, HTML, forged MIME, truncated headers and invalid JPEG paths fail closed', () => {
  const markup = new Uint8Array(Buffer.from('<svg onload="alert(1)"></svg>'))
  for (const mime of ['image/png', 'image/svg+xml', 'text/html']) assert.throws(() => inspectImage(markup, mime))
  assert.throws(() => inspectImage(png(), 'image/jpeg'))
  assert.throws(() => inspectImage(png().slice(0, 15), 'image/png'))
  assert.throws(() => inspectImage(new Uint8Array([0xff,0xd8,0xff,0xe1,255,255]), 'image/jpeg'))
  assert.throws(() => inspectImage(png(0, 10), 'image/png'))
})

test('large dimensions and files above 5MB are accepted without application limits', async () => {
  for (const [width, height, size] of [[4097, 10, 24], [4096, 4096, 24], [8000, 6000, 6 * 1024 * 1024]]) {
    const bytes = new Uint8Array(size); bytes.set(png(width, height))
    await validateProfileImage(new Blob([bytes], { type: 'image/png' }), async () => ({ width, height, close() {} }))
  }
  await validateProfileImage(new Blob([png()], { type: 'image/apng' }), async () => ({ width: 200, height: 400, close() {} }))
  await assert.rejects(validateProfileImage(new Blob([], { type: 'image/png' })))
})

test('decode failures and inconsistent decoded dimensions are rejected and bitmaps close', async () => {
  const blob = new Blob([png()], { type: 'image/png' })
  await assert.rejects(validateProfileImage(blob, async () => { throw new Error('corrupt compressed pixels') }), /이미지를 읽을 수/)
  let closed = 0
  await assert.rejects(validateProfileImage(blob, async () => ({ width: 1, height: 1, close() { closed++ } })), /일치하지/)
  await validateProfileImage(blob, async () => ({ width: 200, height: 400, close() { closed++ } }))
  assert.equal(closed, 2)
})

test('random selection can reach each registered photo and safely handles an empty list', () => {
  const images = ['kenji-a', 'kenji-b', 'kenji-c']
  assert.equal(pickProfileImage([], () => 0), undefined)
  assert.equal(pickProfileImage(images, () => 0), 'kenji-a')
  assert.equal(pickProfileImage(images, () => .5), 'kenji-b')
  assert.equal(pickProfileImage(images, () => .999), 'kenji-c')
  assert.equal(pickProfileImage(images, () => 1), 'kenji-c')
})


test('random pools include only selected deployed filenames, never unchecked or stale photos', () => {
  const photos = [{ name: 'a.png', url: '/a.png' }, { name: 'b.png', url: '/b.png' }, { name: 'c.png', url: '/c.png' }]
  const selected = selectedProfileImages(photos, { 'a.png': true, 'c.png': true, 'removed.png': true })
  assert.deepEqual(selected, [photos[0], photos[2]])
  assert.deepEqual(selectedProfileImages(photos, {}), [])
  assert.equal(pickProfileImage(selected, () => 0), photos[0])
  assert.equal(pickProfileImage(selected, () => .99), photos[2])
  assert.deepEqual(selectedProfileImages(photos, Object.create({ 'b.png': true })), [])
})
