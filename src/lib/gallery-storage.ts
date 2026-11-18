export type GalleryImage = {
  id: string
  title: string
  tags: string[]
  album: string
  credit: string
  src: string
  revision?: number
}

export function galleryGroups(items: readonly Pick<GalleryImage, 'tags' | 'album'>[], mode: '태그' | '앨범'): string[] {
  return [...new Set(items.flatMap(item => mode === '태그' ? item.tags : [item.album || '미분류']))].sort((a, b) => a.localeCompare(b, 'ko'))
}
