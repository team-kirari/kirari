import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { openSecretAlbum, secretAlbumRequest } from '../lib/secret-album-api'
import type { SecretAlbumSummary } from '../lib/secret-albums'
import type { GalleryImage } from '../lib/gallery-storage'
import { copyrightLabel } from '../lib/gallery-catalog'
import { sortGalleryByCredit } from '../lib/gallery'
import { useGalleryReveal } from './useGalleryReveal'
import './SecretAlbums.css'

type OpenAlbum = SecretAlbumSummary & { photos: GalleryImage[] }
export function SecretAlbumContents({ id, onDeleted }: { id: string, onDeleted: () => void }) {
  const [album, setAlbum] = useState<OpenAlbum | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selected, setSelected] = useState<GalleryImage | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const lifetime = useRef({ active: true })
  const grid = useGalleryReveal(JSON.stringify(album?.photos.map(photo => [photo.id, photo.src]) ?? []), id)
  useEffect(() => {
    let active = true
    const urls: string[] = []
    const current = lifetime.current
    current.active = true
    void openSecretAlbum(id).then(result => {
      if (!active) return
      setAlbum({ ...result, photos: result.photos.map(photo => {
        const src = URL.createObjectURL(photo.blob); urls.push(src)
        return { ...photo, src }
      }) })
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : '앨범을 열지 못했어요.') })
    return () => { active = false; current.active = false; for (const url of urls) URL.revokeObjectURL(url) }
  }, [id])
  async function remove() {
    if (busy || !album?.editable) return
    setBusy(true); setError('')
    try {
      await secretAlbumRequest(`/${id}/delete`, { revision: album.revision })
      if (lifetime.current.active) onDeleted()
    } catch (error) { if (lifetime.current.active) setError(error instanceof Error ? error.message : '앨범을 삭제하지 못했어요.') }
    finally { if (lifetime.current.active) setBusy(false) }
  }
  return <section className="secret-album-content" aria-label="관리자 전용 앨범">
    {!album && !error && <p role="status" className="archive-status">앨범을 불러오는 중…</p>}
    {album && <>
      <div className="secret-album-heading"><span className="result-count">{album.photos.length}개의 그림 · 관리자 전용</span>{album.editable && <button className="soft-button" disabled={busy} onClick={() => setDeleting(!deleting)}>앨범 삭제</button>}</div>
      {deleting && <div className="archive-status"><p>앨범과 모든 사진의 접근을 차단할까요? 저장소의 Git 이력과 내려받은 사본은 남을 수 있어요.</p><button className="soft-button" disabled={busy} onClick={() => void remove()}>앨범과 사진 삭제 확인</button></div>}
      {!album.photos.length && <div className="empty-state"><h2>아직 사진이 없어요</h2><p>사진 업로드에서 이 앨범을 선택해 주세요.</p></div>}
    </>}
    <div ref={grid} className="gallery-grid gallery-masonry">{sortGalleryByCredit(album?.photos ?? []).map(photo => <button className="gallery-item" key={photo.id} aria-label={`${photo.title} 크게 보기`} onClick={() => { setSelected(photo); dialog.current?.showModal() }}>
      <div className="gallery-image"><img data-src={photo.src} alt={photo.title} decoding="async" onLoad={event => { event.currentTarget.closest('.gallery-item')?.setAttribute('data-loaded', 'true') }} onError={event => { event.currentTarget.closest('.gallery-item')?.setAttribute('data-loaded', 'error'); setError('일부 사진을 읽지 못했어요.') }} /></div>
      <div className="gallery-caption"><div><span>{photo.tags.map(tag => `#${tag}`).join(' ')}</span><span className="gallery-credit">{copyrightLabel(photo.credit)}</span></div><span className="category-tag">{album?.name}</span></div>
    </button>)}</div>
    {error && <p role="alert" className="archive-status">{error}</p>}
    <dialog ref={dialog} className="art-dialog" aria-label="그림 크게 보기" onClose={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}>
      <div className="dialog-inner"><button className="dialog-close icon-button" aria-label="이미지 닫기" onClick={() => dialog.current?.close()}><X size={20} /></button>{selected && <><img src={selected.src} alt={selected.title} /><div>{copyrightLabel(selected.credit)}</div><div>{album?.name} · {selected.tags.map(tag => `#${tag}`).join(' ')}</div><p>원본 파일의 위치정보 등 메타데이터는 제거되지 않았어요.</p></>}</div>
    </dialog>
  </section>
}
