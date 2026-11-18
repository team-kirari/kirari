import { parsePhotoMetadata } from './gallery-catalog.ts'
import type { PhotoMetadata } from './gallery-catalog.ts'

export type PhotoFields = { credit: string, album: string, tags: string[], tagInput: string }

export function collectPhotoTags(tags: string[], input: string): string[] {
  const result = [...new Set([...tags, ...input.split(/[,，]/).map(tag => tag.trim().replace(/^#+/, '')).filter(Boolean)])]
  if (result.length > 20 || result.some(tag => tag.length > 40 || [...tag].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))) throw new Error('태그는 최대 20개, 각 40자 이하로 입력해 주세요.')
  return result
}

export function photoUploadMetadata(filename: string, fields: PhotoFields): PhotoMetadata {
  const title = [...filename].filter(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join('').slice(0, 120).trim() || '사진'
  const metadata = parsePhotoMetadata({ title, credit: fields.credit.trim(), album: fields.album.trim(), tags: collectPhotoTags(fields.tags, fields.tagInput) })
  if (!metadata) throw new Error('앨범과 저작권자 이름을 확인해 주세요.')
  return metadata
}

// Sequential requests keep each photo and its metadata together. A failed photo
// does not undo accepted photos; callers retry only the remaining jobs.
export async function uploadPhotoBatch<T>(jobs: readonly T[], send: (job: T) => Promise<boolean>, update: (job: T, result: { status: 'uploading' | 'staged' | 'duplicate' | 'error', error: string }) => void) {
  for (const job of jobs) {
    update(job, { status: 'uploading', error: '' })
    try {
      const duplicate = await send(job)
      update(job, { status: duplicate ? 'duplicate' : 'staged', error: '' })
    } catch (error) {
      update(job, { status: 'error', error: error instanceof Error ? error.message : '등록에 실패했어요.' })
    }
  }
}
