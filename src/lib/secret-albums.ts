import { inspectImage } from './profile-images.ts'
import { parsePhotoMetadata } from './gallery-catalog.ts'
import type { PhotoMetadata } from './gallery-catalog'

export const secretAlbumLimits = { fileBytes: 5 * 1024 * 1024, albumBytes: 12 * 1024 * 1024, archiveBytes: 24 * 1024 * 1024, photos: 40, albums: 100, side: 8192, pixels: 24_000_000 }
export const albumIdPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/
export type SecretPhoto = { id: string, mime: string, image: string, metadata: PhotoMetadata }
export type SecretAlbumSummary = { id: string, name: string, revision: number, editable?: boolean }
export type SecretAlbum = SecretAlbumSummary & { photos: SecretPhoto[] }
export const validAlbumName = (value: unknown): value is string => typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= 80 && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)

export function inspectSecretImage(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > secretAlbumLimits.fileBytes || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) throw new Error('비밀 앨범 사진은 PNG·JPG·WebP·GIF, 한 장당 5MB 이하로 선택해 주세요.')
  const dimensions = inspectImage(bytes, mime)
  if (dimensions.width > secretAlbumLimits.side || dimensions.height > secretAlbumLimits.side || dimensions.width * dimensions.height > secretAlbumLimits.pixels) throw new Error('비밀 앨범 사진은 가로·세로 8192px, 총 2400만 픽셀 이하로 선택해 주세요.')
  return dimensions
}

export function parseSecretAlbum(value: unknown): SecretAlbum | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string' || !albumIdPattern.test(item.id) || !validAlbumName(item.name) || !Number.isSafeInteger(item.revision) || (item.revision as number) < 1 || !Array.isArray(item.photos) || item.photos.length > secretAlbumLimits.photos) return null
  const photos: SecretPhoto[] = []
  let size = 0
  for (const photo of item.photos) {
    if (!photo || typeof photo !== 'object' || typeof photo.id !== 'string' || !albumIdPattern.test(photo.id) || typeof photo.mime !== 'string' || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(photo.mime) || typeof photo.image !== 'string' || !photo.image.length || photo.image.length % 4 !== 0 || photo.image.length > Math.ceil(secretAlbumLimits.fileBytes / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(photo.image)) return null
    const metadata = parsePhotoMetadata(photo.metadata)
    if (!metadata || metadata.album !== item.name) return null
    size += photo.image.length
    if (size > secretAlbumLimits.albumBytes) return null
    photos.push({ id: photo.id, mime: photo.mime, image: photo.image, metadata })
  }
  if (new Set(photos.map(photo => photo.id)).size !== photos.length) return null
  return { id: item.id, name: item.name, revision: item.revision as number, photos }
}
