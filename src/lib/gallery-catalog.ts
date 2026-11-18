export type GalleryMetadata = { title: string, tags: string[], album: string, credit: string, deleted: boolean, revision: number }
export const defaultGalleryMetadata: GalleryMetadata = { title: '등록한 그림', tags: [], album: '', credit: '', deleted: false, revision: 0 }

export function parseGalleryMetadata(value: unknown): GalleryMetadata | null {
  if (!value || typeof value !== 'object') return null
  const item = value as GalleryMetadata
  if (Object.keys(item).sort().join(',') !== 'album,credit,deleted,revision,tags,title'
    || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 120
    || typeof item.album !== 'string' || item.album.length > 80
    || typeof item.credit !== 'string' || item.credit.length > 120
    || !Array.isArray(item.tags) || item.tags.length > 20
    || item.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 40)
    || new Set(item.tags).size !== item.tags.length
    || typeof item.deleted !== 'boolean' || !Number.isSafeInteger(item.revision) || item.revision < 1) return null
  return { title: item.title, album: item.album, credit: item.credit, tags: [...item.tags], deleted: item.deleted, revision: item.revision }
}

export function copyrightLabel(credit: string): string {
  const name = credit.trim().replace(/^ⓒ\s*/, '').replace(/\s+님$/, '').trim()
  return name ? `ⓒ ${name} 님` : ''
}
