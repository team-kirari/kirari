import { parsePhotoMetadata } from './gallery-catalog.ts'
import type { PhotoMetadata } from './gallery-catalog.ts'

export type PublishedPhoto = PhotoMetadata & { id: string, extension: 'webp' | 'png', blob: string }

// Only the trusted validator writes this allowlist. Never accept repository paths
// or remote URLs from clients or from upload staging records.
export function parseGalleryManifest(value: unknown): PublishedPhoto[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const manifest = value as { version?: unknown, photos?: unknown }
  if (Object.keys(manifest).sort().join(',') !== 'photos,version' || manifest.version !== 1 || !Array.isArray(manifest.photos) || manifest.photos.length > 10000) return null
  const photos: PublishedPhoto[] = []
  for (const value of manifest.photos) {
    if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'album,blob,credit,extension,id,tags,title') return null
    const { id, extension, blob, ...fields } = value
    const metadata = parsePhotoMetadata(fields)
    if (!metadata || typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id) || !['webp', 'png'].includes(extension) || typeof blob !== 'string' || !/^[a-f0-9]{40}$/.test(blob)) return null
    photos.push({ id, extension, blob, ...metadata })
  }
  return new Set(photos.map(photo => photo.id)).size === photos.length ? photos : null
}
