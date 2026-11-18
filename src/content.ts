import portrait from '@private-assets/img/banana님 커미션_완성.png'
import pair from '@private-assets/img/켄지키요.png'
import kenji from '@private-assets/img/켄지.png'
import kiyo from '@private-assets/img/키요.png'
import kiyoSD from '@private-assets/img/키요SD.png'
import kenjiSD from '@private-assets/img/켄지SD.png'

export const art = { portrait, pair, kenji, kiyo, kiyoSD, kenjiSD }
export const navigation = [
  { id: 'home', label: '홈' },
  { id: 'profile', label: '프로필' },
  { id: 'gallery', label: '갤러리' },
  { id: 'story', label: '이야기' },
  { id: 'log', label: '기록' },
  { id: 'guest', label: '방명록' },
] as const
export type Route = typeof navigation[number]['id'] | 'not-found'

export const gallery = [
  { id: 'portrait', tags: ['켄지', '키요', '페어'], title: '켄지 & 키요', category: '페어', src: portrait, credit: 'banana님 커미션', className: 'portrait' },
  { id: 'pair', tags: ['켄지', '키요', '페어'], title: '함께 있는 모습', category: '페어', src: pair, credit: '페어 일러스트', className: 'pair' },
  { id: 'kenji', tags: ['켄지', '프로필'], title: '켄지', category: '켄지', src: kenji, credit: '캐릭터 일러스트', className: '' },
  { id: 'kiyo', tags: ['키요', '프로필'], title: '키요', category: '키요', src: kiyo, credit: '캐릭터 일러스트', className: '' },
  { id: 'mini', tags: ['키요', '프로필'], title: '키요 · SD', category: '키요', src: kiyoSD, credit: '캐릭터 일러스트', className: '' },
  { id: 'basic', tags: ['켄지', '프로필'], title: '켄지 · SD', category: '켄지', src: kenjiSD, credit: '캐릭터 일러스트', className: '' },
  ...Object.entries(import.meta.glob<string>('@private-assets/gallery/*.{png,jpg,jpeg,webp,gif,PNG,JPG,JPEG,WEBP,GIF}', { eager: true, query: '?url', import: 'default' })).sort(([a], [b]) => a.localeCompare(b)).map(([path, src]) => ({ id: path, tags: ['페어'], title: '등록한 그림', category: '페어', src, credit: '', className: '' })),
]
