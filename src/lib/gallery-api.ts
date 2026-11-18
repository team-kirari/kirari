import { parseGalleryManifest } from './gallery-manifest.ts'
import type { GalleryImage } from './gallery-storage.ts'

export function galleryEndpoint(configured: unknown): string | null {
  if (!configured) return null
  if (typeof configured !== 'string') throw new Error('갤러리 서버 주소를 확인해 주세요.')
  const url = new URL(configured)
  if (url.protocol !== 'https:' || !/^kirari-stories\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) || !['/stories', '/photos'].includes(url.pathname) || url.search || url.hash || url.username || url.password || url.port) throw new Error('갤러리 서버 주소를 확인해 주세요.')
  url.pathname = '/gallery'
  return url.href
}

export function readGalleryResponse(value: unknown, endpoint: string): GalleryImage[] {
  if (!value || typeof value !== 'object') throw new Error('갤러리 목록 형식을 확인해 주세요.')
  const manifest = value as { version?: unknown, photos?: unknown }
  if (Object.keys(value).sort().join(',') !== 'photos,version' || !Array.isArray(manifest.photos) || manifest.photos.length > 10000
    || manifest.photos.some(photo => !photo || typeof photo !== 'object' || Object.keys(photo).sort().join(',') !== 'album,credit,extension,id,tags,title')) throw new Error('갤러리 목록 형식을 확인해 주세요.')
  const photos = parseGalleryManifest({ version: manifest.version, photos: manifest.photos.map(photo => ({ ...photo, blob: '0'.repeat(40) })) })
  if (!photos) throw new Error('갤러리 목록 형식을 확인해 주세요.')
  return photos.map(({ id, extension, title, tags, album, credit }) => ({ id, title, tags, album, credit, src: `${endpoint}/${id}.${extension}` }))
}

export async function fetchGallery(endpoint: string, signal: AbortSignal): Promise<GalleryImage[]> {
  const response = await fetch(endpoint, { signal, credentials: 'omit', cache: 'no-store', redirect: 'error' })
  if (!response.ok) throw new Error('갤러리를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.')
  return readGalleryResponse(await response.json(), endpoint)
}
