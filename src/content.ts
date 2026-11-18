import portrait from '@private-assets/img/banana님 커미션_완성.png'
import pair from '@private-assets/img/켄지키요.png'
import kenji from '@private-assets/img/켄지.png'
import kiyo from '@private-assets/img/키요.png'
import kiyoSD from '@private-assets/img/키요SD.png'
import kenjiSD from '@private-assets/img/켄지SD.png'
import { parsePhotoMetadata } from './lib/gallery-catalog'

export const art = { portrait, pair, kenji, kiyo, kiyoSD, kenjiSD }
export const navigation = [
  { id: 'home', label: '홈' },
  { id: 'profile', label: '프로필' },
  { id: 'gallery', label: '갤러리' },
  { id: 'story', label: '이야기' },
  { id: 'log', label: '타임라인' },
  { id: 'trpg', label: '로그' },
  { id: 'guest', label: '방명록' },
] as const
export type Route = typeof navigation[number]['id'] | 'not-found' | 'search'

const galleryCredits = import.meta.glob<unknown>('@private-assets/gallery/*.json', { eager: true, import: 'default' })

// Only newly uploaded gallery files belong here; character/hero art stays separate.
export const gallery: { id: string, tags: string[], title: string, album: string, category: string, src: string, credit: string, className: string }[] = Object.entries(import.meta.glob<string>('@private-assets/gallery/*.{webp,png}', { eager: true, query: '?url', import: 'default' }))
  .flatMap(([path, src]) => {
    const id = path.split('/').at(-1)?.replace(/\.(?:webp|png)$/, '') ?? ''
    const metadata = parsePhotoMetadata(galleryCredits[path.replace(/\.(?:webp|png)$/, '.json')]) ?? { title: '등록한 그림', tags: [], album: '', credit: '' }
    return /^[a-f0-9]{64}$/.test(id) ? [{ id, src, ...metadata, category: metadata.album, className: '' }] : []
  })
