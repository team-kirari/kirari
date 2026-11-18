import type { PersonId } from './profiles'

export type IllustrationVersion = 'old' | 'new'
export type ProfileIllustration = { name: string, url: string }
export type IllustrationLibrary = Record<PersonId, Record<IllustrationVersion, ProfileIllustration[]>>

export function selectedProfileImages(images: ProfileIllustration[], selection: Record<string, true>): ProfileIllustration[] {
  return images.filter(image => Object.hasOwn(selection, image.name) && selection[image.name] === true)
}

export function createIllustrationLibrary(files: Record<string, string>): IllustrationLibrary {
  const result: IllustrationLibrary = { kenji: { old: [], new: [] }, kiyo: { old: [], new: [] } }
  for (const [path, url] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const match = /^(?:\.\.\/assets|\.\.\/\.\.\/\.local\/kirari-private\/assets)\/profiles\/(kenji|kiyo)\/(old|new)\/([^/\\]+\.(?:png|jpe?g|webp|gif))$/i.exec(path)
    if (!match || !['kenji', 'kiyo'].includes(match[1]) || !['old', 'new'].includes(match[2])) continue
    result[match[1] as PersonId][match[2] as IllustrationVersion].push({ name: match[3], url })
  }
  return result
}

const allowedTypes = ['image/png', 'image/apng', 'image/jpeg', 'image/webp', 'image/gif']

export function inspectImage(bytes: Uint8Array, mime: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const text = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length))
  let type = '', width = 0, height = 0
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n) && text(12, 4) === 'IHDR') {
    type = 'image/png'; width = view.getUint32(16); height = view.getUint32(20)
  } else if (bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(text(0, 6))) {
    type = 'image/gif'; width = view.getUint16(6, true); height = view.getUint16(8, true)
  } else if (bytes.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    type = 'image/webp'
    const chunk = text(12, 4)
    if (chunk === 'VP8X') {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    } else if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff
    } else if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8)
      height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0xf) << 10)
    }
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    type = 'image/jpeg'
    let offset = 2
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 0xff) break
      while (bytes[offset] === 0xff) offset++
      const marker = bytes[offset++]
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 2 > bytes.length) break
      const size = view.getUint16(offset)
      if (size < 2 || offset + size > bytes.length) break
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && size >= 8) {
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break
      }
      offset += size
    }
  }
  if (!allowedTypes.includes(mime) || (mime === 'image/apng' ? 'image/png' : mime) !== type || !width || !height) throw new Error('PNG·JPEG·WebP·GIF 이미지의 실제 형식을 확인해 주세요.')
  return { width, height }
}

export async function validateProfileImage(blob: Blob, decode = (image: Blob) => createImageBitmap(image, { imageOrientation: 'none' })) {
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error('내용이 있는 이미지 파일을 선택해 주세요.')
  const expected = inspectImage(new Uint8Array(await blob.arrayBuffer()), blob.type)
  let bitmap: Awaited<ReturnType<typeof decode>>
  try { bitmap = await decode(blob) } catch { throw new Error('이미지를 읽을 수 없어요. 다른 파일로 다시 등록해 주세요.') }
  try {
    if (bitmap.width !== expected.width || bitmap.height !== expected.height) throw new Error('이미지의 크기 정보가 일치하지 않아요.')
  } finally { bitmap.close() }
}

export function pickProfileImage<T>(images: readonly T[], random = Math.random): T | undefined {
  if (!images.length) return undefined
  return images[Math.min(images.length - 1, Math.max(0, Math.floor(random() * images.length)))]
}
