import { createHash } from 'node:crypto'
import sharp from 'sharp'

export const MAX_BYTES = 5 * 1024 * 1024
export const targets = ['gallery', 'profiles/kenji/old', 'profiles/kenji/new', 'profiles/kiyo/old', 'profiles/kiyo/new']

export async function preparePhoto(input, mime, target) {
  if (!targets.includes(target)) throw new Error('Invalid target')
  if (!Buffer.isBuffer(input) || !input.length || input.length > MAX_BYTES) throw new Error('Invalid size')
  const formats = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp', 'image/gif': 'gif' }
  // Detect before decoding: SVG/HTML and mismatched MIME never reach the decoder.
  const signature = input.subarray(0, 12)
  const detected = signature.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
    : signature[0] === 255 && signature[1] === 216 ? 'jpeg'
      : ['GIF87a', 'GIF89a'].includes(signature.subarray(0, 6).toString()) ? 'gif'
        : signature.subarray(0, 4).toString() === 'RIFF' && signature.subarray(8, 12).toString() === 'WEBP' ? 'webp' : ''
  if (!detected || formats[mime] !== detected) throw new Error('Invalid format')
  const image = sharp(input, { limitInputPixels: 16_000_000, failOn: 'warning', animated: true })
  const meta = await image.metadata()
  if (meta.format !== detected || !meta.width || !meta.height || meta.width > 4096 || meta.height > 4096
    || meta.width * meta.height > 16_000_000 || (meta.pages ?? 1) > 1) throw new Error('Invalid dimensions or animation')
  // Full decode + re-encode strips EXIF/GPS and other input metadata. Static WebP output only.
  const output = await image.rotate().webp({ lossless: true }).toBuffer()
  if (output.length > MAX_BYTES) throw new Error('Encoded image too large')
  const id = createHash('sha256').update(output).digest('hex')
  return { path: `assets/${target}/${id}.webp`, content: output.toString('base64') }
}

