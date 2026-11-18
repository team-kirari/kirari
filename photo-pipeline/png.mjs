import sharp from 'sharp'

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const table = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc(bytes) {
  let value = 0xffffffff
  for (const byte of bytes) value = table[(value ^ byte) & 255] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}
export function pngChunk(type, data) {
  const chunk = Buffer.alloc(data.length + 12)
  chunk.writeUInt32BE(data.length); chunk.write(type, 4); data.copy(chunk, 8)
  chunk.writeUInt32BE(crc(chunk.subarray(4, -4)), chunk.length - 4)
  return chunk
}

// Keep animation chunks unchanged, strip ancillary metadata, and decode every
// frame as a standalone PNG so damaged later frames cannot pass as a still PNG.
export async function prepareApng(input) {
  const chunks = []
  let offset = 8
  while (offset < input.length) {
    if (offset + 12 > input.length) throw new Error('Truncated PNG chunk')
    const length = input.readUInt32BE(offset), end = offset + length + 12
    if (end > input.length) throw new Error('Truncated PNG data')
    const raw = input.subarray(offset, end), type = raw.toString('ascii', 4, 8)
    if (!/^[A-Za-z]{4}$/.test(type) || crc(raw.subarray(4, -4)) !== raw.readUInt32BE(raw.length - 4)) throw new Error('Invalid PNG checksum')
    chunks.push({ type, data: raw.subarray(8, -4), raw })
    offset = end
    if (type === 'IEND') break
  }
  if (offset !== input.length || chunks[0]?.type !== 'IHDR' || chunks[0].data.length !== 13 || chunks.at(-1)?.type !== 'IEND' || chunks.at(-1).data.length) throw new Error('Invalid PNG structure')
  if (!chunks.some(chunk => chunk.type === 'acTL')) return null
  const header = chunks[0].data, width = header.readUInt32BE(0), height = header.readUInt32BE(4)
  const palette = [], frames = [], defaultData = []
  let control, frame, sequence = 0, seenData = false, endedData = false
  const allowed = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'acTL', 'fcTL', 'fdAT'])
  for (const chunk of chunks.slice(1)) {
    const { type, data } = chunk
    if (seenData && type !== 'IDAT') endedData = true
    if (!allowed.has(type) && type[0] === type[0].toUpperCase()) throw new Error('Unknown critical PNG chunk')
    if (type === 'IHDR') throw new Error('Duplicate PNG header')
    if (type === 'PLTE' || type === 'tRNS') {
      if (seenData || palette.some(item => item.type === type)) throw new Error('Invalid PNG palette')
      palette.push(chunk)
    } else if (type === 'acTL') {
      if (control || seenData || data.length !== 8 || !data.readUInt32BE(0)) throw new Error('Invalid APNG control')
      control = data
    } else if (type === 'fcTL') {
      if (!control || data.length !== 26 || data.readUInt32BE(0) !== sequence++ || (frame && !frame.data.length)) throw new Error('Invalid APNG frame')
      const w = data.readUInt32BE(4), h = data.readUInt32BE(8), x = data.readUInt32BE(12), y = data.readUInt32BE(16)
      if (!w || !h || x + w > width || y + h > height || data[24] > 2 || data[25] > 1 || (!seenData && (w !== width || h !== height || x || y))) throw new Error('Invalid APNG frame dimensions')
      frame = { width: w, height: h, default: !seenData, data: [] }; frames.push(frame)
    } else if (type === 'IDAT') {
      if (!control || endedData || (frame && !frame.default)) throw new Error('Invalid APNG default frame')
      seenData = true; defaultData.push(data)
      if (frame) frame.data.push(data)
    } else if (type === 'fdAT') {
      if (!seenData || !frame || frame.default || data.length < 5 || data.readUInt32BE(0) !== sequence++) throw new Error('Invalid APNG frame data')
      frame.data.push(data.subarray(4))
    }
  }
  if (!seenData || frames.length !== control.readUInt32BE(0) || frames.some(item => !item.data.length)) throw new Error('Incomplete APNG')
  const decode = async (w, h, data) => {
    const ihdr = Buffer.from(header); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
    const png = Buffer.concat([signature, pngChunk('IHDR', ihdr), ...palette.map(item => item.raw), ...data.map(item => pngChunk('IDAT', item)), pngChunk('IEND', Buffer.alloc(0))])
    await sharp(png, { limitInputPixels: false, failOn: 'warning' }).raw().toBuffer()
  }
  await decode(width, height, defaultData)
  for (const item of frames) if (!item.default) await decode(item.width, item.height, item.data)
  return Buffer.concat([signature, ...chunks.filter(chunk => allowed.has(chunk.type)).map(chunk => chunk.raw)])
}
