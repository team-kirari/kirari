import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { prepareApng } from './png.mjs'

export const targets = ['gallery', 'profiles/kenji/old', 'profiles/kenji/new', 'profiles/kiyo/old', 'profiles/kiyo/new']

export async function preparePhoto(input, mime, target) {
  if (!targets.includes(target)) throw new Error('Invalid target')
  if (!Buffer.isBuffer(input) || !input.length) throw new Error('Invalid size')
  const formats = { 'image/png': 'png', 'image/apng': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp', 'image/gif': 'gif' }
  // Detect before decoding: SVG/HTML and mismatched MIME never reach the decoder.
  const signature = input.subarray(0, 12)
  const detected = signature.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
    : signature[0] === 255 && signature[1] === 216 ? 'jpeg'
      : ['GIF87a', 'GIF89a'].includes(signature.subarray(0, 6).toString()) ? 'gif'
        : signature.subarray(0, 4).toString() === 'RIFF' && signature.subarray(8, 12).toString() === 'WEBP' ? 'webp' : ''
  if (!detected || formats[mime] !== detected) throw new Error('Invalid format')
  const apng = detected === 'png' ? await prepareApng(input) : null
  let output = apng, extension = apng ? 'png' : 'webp'
  if (!output) {
    const image = sharp(input, { limitInputPixels: false, failOn: 'warning', animated: true })
    const meta = await image.metadata()
    if (meta.format !== detected || !meta.width || !meta.height) throw new Error('Invalid dimensions')
    // PNG avoids the WebP encoder's fixed dimension ceiling for large stills.
    if ((meta.pages ?? 1) === 1 && (meta.width > 16383 || meta.height > 16383)) {
      output = await image.rotate().png().toBuffer(); extension = 'png'
    } else output = await image.rotate().webp({ lossless: true }).toBuffer()
  }
  const id = createHash('sha256').update(output).digest('hex')
  return { path: `assets/${target}/${id}.${extension}`, content: output.toString('base64') }
}

