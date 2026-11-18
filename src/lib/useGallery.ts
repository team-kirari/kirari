import { useEffect, useRef, useState } from 'react'
import type { GalleryImage } from './gallery-storage'
import { gallery as publicGallery } from '../content'
import { getFirebaseConfig } from './auth'
import { defaultGalleryMetadata } from './gallery-catalog'
import type { GalleryMetadata } from './gallery-catalog'
import type { createGalleryStore } from './firebase-gallery'

export function useGallery() {
  const [catalog, setCatalog] = useState<Record<string, GalleryMetadata>>({})
  const [sharedReady, setSharedReady] = useState(false)
  const [sharedStatus, setSharedStatus] = useState('')
  const sharedStore = useRef<ReturnType<typeof createGalleryStore> | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const locked = useRef(false)
  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    const config = getFirebaseConfig(import.meta.env)
    if (!config) return
    void import('./firebase-gallery').then(({ createGalleryStore }) => {
      if (!active) return
      sharedStore.current = createGalleryStore(config)
      unsubscribe = sharedStore.current.subscribe(value => {
        if (active) { setCatalog(value); setSharedReady(true); setSharedStatus('') }
      }, () => { if (active) { setSharedReady(false); setSharedStatus('공용 그림 정보를 읽지 못했어요. 연결과 보안 규칙을 확인해 주세요.') } })
    }).catch(() => { if (active) setSharedStatus('공용 저장소에 연결하지 못했어요.') })
    return () => { active = false; unsubscribe?.(); sharedStore.current = null }
  }, [])
  const sharedItems: GalleryImage[] = publicGallery.flatMap(item => {
    const metadata = catalog[item.id] ?? { ...defaultGalleryMetadata, credit: item.credit }
    return metadata.deleted ? [] : [{ ...item, ...metadata, category: metadata.album || '미분류' }]
  })
  async function edit(item: GalleryImage, metadata: Pick<GalleryMetadata, 'title' | 'tags' | 'album' | 'credit'>, deleted = false) {
    const fields = { title: metadata.title, tags: metadata.tags, album: metadata.album, credit: metadata.credit }
    if (locked.current) return false
    if (!sharedReady || !sharedStore.current) { setStatus('공용 저장소 연결 후 다시 시도해 주세요.'); return false }
    locked.current = true; setBusy(true); setStatus('')
    try {
      await sharedStore.current.save(item.id, { ...fields, deleted, revision: item.revision ?? 0 })
      setStatus(deleted ? '공용 갤러리에서 숨겼어요. 기존 배포 파일과 내려받은 사본은 남을 수 있어요.' : '모든 방문자에게 보이는 그림 정보를 저장했어요.')
      return true
    } catch (error) {
      setStatus(error instanceof Error && error.message === 'gallery-conflict' ? '다른 관리자가 먼저 수정했어요. 편집창을 닫고 다시 열어 주세요.' : '저장하지 못했어요. 관리자 권한과 연결을 확인해 주세요.')
      return false
    } finally { locked.current = false; setBusy(false) }
  }
  return { items: sharedItems, sharedReady, sharedStatus, busy, status, edit }
}
