import type { GalleryImage } from './gallery-storage.ts'
import type { StorySummary } from './stories.ts'
import type { LogSummary } from './trpg-log-summary.ts'

export const searchCategories = ['갤러리', '이야기', '로그'] as const
export type SearchCategory = typeof searchCategories[number]
export type SearchResult = { id: string, category: SearchCategory, title: string, text: string, href: string }
export type SearchSources = {
  gallery: GalleryImage[], stories: StorySummary[], logs: LogSummary[],
}
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g, ' ').trim()

export function searchRecords(query: string, sources: SearchSources): SearchResult[] {
  const words = normalize(query.slice(0, 120)).split(' ').filter(Boolean)
  if (!words.length) return []
  const results: SearchResult[] = []
  function add(result: SearchResult, searchableText = `${result.title} ${result.text}`) {
    const text = normalize(searchableText)
    if (words.every(word => text.includes(word))) results.push(result)
  }
  for (const item of sources.gallery) {
    const text = [item.album, ...item.tags, item.credit].filter(Boolean).join(' · ')
    add({ id: item.id, category: '갤러리', title: item.title, text, href: `#gallery?item=${encodeURIComponent(item.id)}` }, text)
  }
  // Use only public list metadata. Never fetch unlocked bodies or editor data for indexing.
  for (const item of sources.stories) add({ id: item.id, category: '이야기', title: item.title, text: [item.author, item.writtenOn, item.protected ? '잠긴 글' : ''].filter(Boolean).join(' · '), href: `#story?story=${encodeURIComponent(item.id)}` })
  for (const item of sources.logs) add({ id: item.id, category: '로그', title: item.title, text: item.logDate ?? '', href: `#trpg?log=${encodeURIComponent(item.id)}` })
  return results
}

export function searchExcerpt(text: string, query: string): string {
  const word = normalize(query).split(' ')[0]
  const index = normalize(text).indexOf(word)
  const start = Math.max(0, index - 45)
  return `${start ? '…' : ''}${text.slice(start, start + 180)}${text.length > start + 180 ? '…' : ''}`
}
