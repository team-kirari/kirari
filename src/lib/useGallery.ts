import { useEffect, useRef, useState } from 'react'
import type { GalleryImage } from './gallery-storage'
import { gallery as publicGallery } from '../content'
import { getFirebaseConfig } from './auth'
import { defaultGalleryMetadata } from './gallery-catalog'
import type { GalleryMetadata } from './gallery-catalog'
import type { createGalleryStore } from './firebase-gallery'
import { fetchGallery, galleryEndpoint } from './gallery-api'

const galleryConfig = (() => {
  try { return { endpoint: galleryEndpoint(import.meta.env.VITE_STORY_API_URL), error: '' } }
  catch { return { endpoint: null, error: '갤러리 서버 주소를 확인해 주세요.' } }
})()

export function useGallery() {
  const [published, setPublished] = useState<GalleryImage[]>(publicGallery)
  const [photoLoading, setPhotoLoading] = useState(Boolean(galleryConfig.endpoint))
  const [photoStatus, setPhotoStatus] = useState(galleryConfig.error)
  const [catalog, setCatalog] = useState<Record<string, GalleryMetadata>>({})
  const [sharedReady, setSharedReady] = useState(false)
  const [loading, setLoading] = useState(() => Boolean(getFirebaseConfig(import.meta.env)))
  const [sharedStatus, setSharedStatus] = useState('')
  const sharedStore = useRef<ReturnType<typeof createGalleryStore> | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const locked = useRef(false)
  useEffect(() => {
    const endpoint = galleryConfig.endpoint
    if (!endpoint) return
    let active = true, pendingUntil = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    let knownIds: string | null = null
    async function refresh() {
      controller?.abort()
      const current = new AbortController()
      controller = current
      try {
        const photos = await fetchGallery(endpoint!, AbortSignal.any([current.signal, AbortSignal.timeout(25000)]))
        if (!active || current.signal.aborted) return
        const ids = photos.map(photo => photo.id).sort().join(',')
        if (pendingUntil && knownIds !== null && ids !== knownIds) {
          pendingUntil = 0
          setPhotoStatus('검증된 사진을 갤러리에 반영했어요.')
        } else if (!pendingUntil) setPhotoStatus('')
        knownIds = ids
        setPublished(photos)
      } catch {
        if (active && !current.signal.aborted) setPhotoStatus('새 갤러리 목록을 읽지 못했어요. 잠시 후 새로고침해 주세요.')
      } finally {
        if (active && !current.signal.aborted) {
          setPhotoLoading(false)
          if (pendingUntil > Date.now()) timer = setTimeout(() => void refresh(), 10000)
          else if (pendingUntil) {
            pendingUntil = 0
            setPhotoStatus('아직 새 사진을 확인하지 못했어요. 검증 후 새로고침하면 표시돼요.')
          }
        }
      }
    }
    const focus = () => { clearTimeout(timer); void refresh() }
    const uploaded = () => {
      clearTimeout(timer)
      pendingUntil = Date.now() + 180000
      setPhotoStatus('사진을 접수했어요. 이미지 검증이 끝나면 자동으로 표시돼요.')
      void refresh()
    }
    void refresh()
    window.addEventListener('focus', focus)
    window.addEventListener('kirari:gallery-refresh', focus)
    window.addEventListener('kirari:photos-staged', uploaded)
    return () => { active = false; clearTimeout(timer); controller?.abort(); window.removeEventListener('focus', focus); window.removeEventListener('kirari:gallery-refresh', focus); window.removeEventListener('kirari:photos-staged', uploaded) }
  }, [])
  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    const config = getFirebaseConfig(import.meta.env)
    if (!config) return
    void import('./firebase-gallery').then(({ createGalleryStore }) => {
      if (!active) return
      sharedStore.current = createGalleryStore(config)
      unsubscribe = sharedStore.current.subscribe(value => {
        if (active) { setCatalog(value); setSharedReady(true); setLoading(false); setSharedStatus('') }
      }, () => { if (active) { setSharedReady(false); setLoading(false); setSharedStatus('공용 그림 정보를 읽지 못했어요. 연결과 보안 규칙을 확인해 주세요.') } })
    }).catch(() => { if (active) { setLoading(false); setSharedStatus('공용 저장소에 연결하지 못했어요.') } })
    return () => { active = false; unsubscribe?.(); sharedStore.current = null }
  }, [])
  const sharedItems: GalleryImage[] = published.flatMap(item => {
    const metadata = catalog[item.id] ?? { ...defaultGalleryMetadata, title: item.title, tags: item.tags, album: item.album, credit: item.credit }
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
  return { items: sharedItems, loading: loading || photoLoading, sharedReady, sharedStatus, busy, status: photoStatus || status, edit,
    refresh: () => window.dispatchEvent(new Event('kirari:gallery-refresh')) }
}
