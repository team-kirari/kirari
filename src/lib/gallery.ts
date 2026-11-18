import type { PersonId } from './profiles.ts'

const characterTags: Record<PersonId, string> = { kenji: '켄지', kiyo: '키요' }

export function sortGalleryByCredit<T extends { credit: string }>(items: readonly T[]): T[] {
  const name = (credit: string) => credit.trim().replace(/^ⓒ\s*/, '').replace(/\s+님$/, '').trim()
  return [...items].sort((a, b) => {
    const left = name(a.credit)
    const right = name(b.credit)
    if (!left || !right) return Number(!left) - Number(!right)
    return left.localeCompare(right, 'ko')
  })
}

export function appearanceGallery<T extends { src: string, tags: readonly string[] }>(
  items: readonly T[], person: PersonId, profileSources: readonly string[],
): T[] {
  const excluded = new Set(profileSources)
  return items.filter(item => item.tags.includes(characterTags[person])
    && !item.tags.includes('프로필') && !excluded.has(item.src))
}
