export type PersonId = 'kenji' | 'kiyo'

export const profileFields = {
  surname: '성', name: '이름', originalName: '한자 이름', gender: '성별', age: '나이',
  birthday: '생일', height: '키 (cm)', weight: '몸무게 (kg)',
  quote: '한마디', tags: '성격 해시태그', color: '대표 컬러',
  appearance: '외형 특징', impression: '첫인상', outfit: '옷차림 설명', symbol: '소지품 / 상징물',
  outside: '겉으로 보이는 성격', inside: '내면', strengths: '장점', weaknesses: '단점',
  beliefs: '가치관 / 신념', goals: '욕구 / 목표', fears: '두려움',
  speech: '상대에게 쓰는 말투', address: '상대를 부르는 호칭',
  likes: '좋아하는 것', dislikes: '싫어하는 것',
} as const

export type ProfileField = keyof typeof profileFields
export type CharacterProfile = Record<ProfileField, string>
export type Profiles = Record<PersonId, CharacterProfile>
export type PhotoSelection = { old: Record<string, true>, new: Record<string, true> }
export type PublishedProfile = { profile: CharacterProfile, revision: number, photoSelection: PhotoSelection }
export const emptyPhotoSelection = (): PhotoSelection => ({ old: {}, new: {} })

export function validPhotoSelection(value: unknown): value is PhotoSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 2) return false
  return ['old', 'new'].every(version => {
    const selection = record[version]
    return !!selection && typeof selection === 'object' && !Array.isArray(selection)
      && Object.entries(selection).every(([name, selected]) => selected === true && name.length <= 255 && !Array.from(name).some(character => character.charCodeAt(0) < 32) && /^[^/\\]+\.(png|jpe?g|webp|gif)$/i.test(name))
  })
}

export function validProfile(value: unknown): value is CharacterProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const keys = Object.keys(profileFields)
  if (Object.keys(record).length !== keys.length || !keys.every(key => typeof record[key] === 'string' && (record[key] as string).length <= 4000)) return false
  const profile = record as CharacterProfile
  if (!profile.name.trim() || profile.name.length > 80 || profile.surname.length > 80 || profile.age.length > 80 || !/^#[0-9A-Fa-f]{6}$/.test(profile.color)) return false
  if (!['', '존댓말', '반말', '혼용'].includes(profile.speech)) return false
  for (const field of ['height', 'weight'] as const) {
    const number = Number(profile[field])
    if (profile[field] !== '' && (!/^\d+(\.\d)?$/.test(profile[field]) || !Number.isFinite(number)
      || number < 1 || number > 500)) return false
  }
  return true
}

// Older published profiles used one name field and included occupation.
// Preserve that name verbatim; an editor can explicitly separate the surname.
function readProfile(value: unknown): CharacterProfile | null {
  if (validProfile(value)) return value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const legacyKeys = [...Object.keys(profileFields).filter(key => key !== 'surname'), 'occupation']
  if (Object.keys(record).length !== legacyKeys.length
    || !legacyKeys.every(key => typeof record[key] === 'string' && (record[key] as string).length <= 4000)) return null
  const normalized = Object.fromEntries(Object.keys(profileFields).map(key => [key, key === 'surname' ? '' : record[key]]))
  return validProfile(normalized) ? normalized : null
}

export function profileFullName(profile: CharacterProfile): string {
  return [profile.surname.trim(), profile.name.trim()].filter(Boolean).join(' ')
}

export function profileAge(value: string): string {
  const age = value.trim()
  return age ? (age.endsWith('세') ? age : `${age}세`) : '—'
}

export function parsePublishedProfile(value: unknown): PublishedProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const profile = readProfile(record.profile)
  if (!Object.keys(record).every(key => ['profile', 'revision', 'photoSelection'].includes(key))
    || (record.photoSelection !== undefined && !validPhotoSelection(record.photoSelection)) || !profile || !Number.isSafeInteger(record.revision)
    || (record.revision as number) < 1 || (record.revision as number) >= Number.MAX_SAFE_INTEGER) return null
  return { profile, revision: record.revision as number, photoSelection: (record.photoSelection as PhotoSelection | undefined) ?? emptyPhotoSelection() }
}

export function createProfiles(): Profiles {
  const blank = Object.fromEntries(Object.keys(profileFields).map(key => [key, ''])) as CharacterProfile
  return {
    kenji: { ...blank, name: '켄지', color: '#8BA5CB' },
    kiyo: { ...blank, name: '키요', color: '#D8A4B9' },
  }
}

export function personalityTags(value: string): string[] {
  return [...new Set(value.split(/[,#\n]+/).map(tag => tag.trim()).filter(Boolean))].slice(0, 8)
}
