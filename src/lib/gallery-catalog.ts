export type GalleryMetadata = { title: string, tags: string[], album: string, credit: string, deleted: boolean, revision: number }
export const defaultGalleryMetadata: GalleryMetadata = { title: '등록한 그림', tags: [], album: '', credit: '', deleted: false, revision: 0 }

export type PhotoMetadata = Pick<GalleryMetadata, 'title' | 'tags' | 'album' | 'credit'>

// Both legacy copyright sidecars and new upload metadata are public data.
export function parsePhotoMetadata(value: unknown): PhotoMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as PhotoMetadata
  const keys = Object.keys(item).sort().join(',')
  if (keys !== 'credit' && keys !== 'album,credit,tags,title') return null
  const fields = keys === 'credit' ? { title: '등록한 그림', tags: [], album: '', credit: item.credit } : item
  const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  if (!text(fields.credit, 120) || !fields.credit.trim() || !text(fields.title, 120) || !fields.title.trim()
    || !text(fields.album, 80) || !Array.isArray(fields.tags) || fields.tags.length > 20
    || fields.tags.some(tag => !text(tag, 40) || !tag.trim()) || new Set(fields.tags).size !== fields.tags.length) return null
  const tags = fields.tags.map(tag => tag.trim())
  if (new Set(tags).size !== tags.length) return null
  return { title: fields.title.trim(), tags, album: fields.album.trim(), credit: fields.credit.trim() }
}

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
