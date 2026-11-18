import { useEffect, useRef, useState } from 'react'
import { FolderPlus, ImagePlus, Plus, Upload, X } from 'lucide-react'
import { validateProfileImage } from '../lib/profile-images'
import { getFirebaseConfig } from '../lib/auth'
import { copyrightLabel } from '../lib/gallery-catalog'
import type { GalleryImage } from '../lib/gallery-storage'
import { collectPhotoTags, photoUploadMetadata } from '../lib/photo-upload'
import type { PhotoFields } from '../lib/photo-upload'
import { listSecretAlbums, readSecretSummary, secretAlbumRequest } from '../lib/secret-album-api'
import { inspectSecretImage, secretAlbumLimits } from '../lib/secret-albums'
import type { SecretAlbumSummary } from '../lib/secret-albums'
import './PhotoUpload.css'

export function PhotoUpload({ items, onClose }: { items: readonly GalleryImage[], onClose?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  return <><button className="soft-button" onClick={() => { setOpen(true); dialog.current?.showModal() }}><ImagePlus size={16} /> 사진 업로드</button>
    <dialog ref={dialog} className="photo-upload-dialog" onCancel={event => { if (busy) event.preventDefault() }} onClose={() => { setOpen(false); onClose?.() }} onClick={event => { if (!busy && event.target === event.currentTarget) dialog.current?.close() }} aria-labelledby="photo-upload-title">
      {open && <UploadForm items={items} busy={busy} setBusy={setBusy} close={() => dialog.current?.close()} />}
    </dialog></>
}

type UploadPhoto = PhotoFields & {
  id: string, file: File, preview: string, status: 'ready' | 'uploading' | 'staged' | 'duplicate' | 'error', error: string,
  creatingAlbum: boolean, newAlbum: string, newAlbumId: string, secretAlbumId: string, secret: boolean,
}
const accepted = (photo: UploadPhoto) => photo.status === 'staged' || photo.status === 'duplicate'

function UploadForm({ items, close, busy, setBusy }: { items: readonly GalleryImage[], close: () => void, busy: boolean, setBusy: (value: boolean) => void }) {
  const [photos, setPhotos] = useState<UploadPhoto[]>([])
  const [createdAlbums, setCreatedAlbums] = useState<string[]>([])
  const [secretAlbums, setSecretAlbums] = useState<SecretAlbumSummary[]>([])
  const [albumBusy, setAlbumBusy] = useState(false)
  const [secretStatus, setSecretStatus] = useState('')
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')
  const selection = useRef({ version: 0 })
  const previews = useRef(new Set<string>())
  const endpoint = import.meta.env.VITE_PHOTO_UPLOAD_URL as string | undefined
  const albums = [...new Set([...items.map(item => item.album), ...createdAlbums, ...photos.filter(photo => !photo.secretAlbumId).map(photo => photo.album)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
  const suggestedTags = [...new Set(items.flatMap(item => item.tags))].slice(0, 8)
  const pending = photos.filter(photo => !accepted(photo))
  const completed = photos.length - pending.length
  useEffect(() => {
    const urls = previews.current
    const lifetime = selection.current
    return () => { lifetime.version++; for (const url of urls) URL.revokeObjectURL(url); urls.clear() }
  }, [])
  useEffect(() => {
    let active = true
    void listSecretAlbums().then(albums => { if (active) setSecretAlbums(albums.filter(album => album.editable)) }).catch(() => { if (active) setSecretStatus('비밀 앨범 목록을 읽지 못했어요. 서버 반영과 연결을 확인해 주세요.') })
    return () => { active = false }
  }, [])
  function update(id: string, patch: Partial<UploadPhoto>) {
    setPhotos(current => current.map(photo => photo.id === id ? { ...photo, ...patch } : photo))
  }
  function remove(photo: UploadPhoto) {
    URL.revokeObjectURL(photo.preview); previews.current.delete(photo.preview)
    setPhotos(current => current.filter(item => item.id !== photo.id))
  }
  async function selectPhotos(files: File[]) {
    const version = ++selection.current.version
    if (!files.length) return
    setValidating(true); setError('')
    const rejected: string[] = []
    try {
      for (let candidate of files) {
        try {
          if (!candidate.type && /\.apng$/i.test(candidate.name)) candidate = new File([candidate], candidate.name, { type: 'image/apng', lastModified: candidate.lastModified })
          await validateProfileImage(candidate)
          if (version !== selection.current.version) return
          const preview = URL.createObjectURL(candidate); previews.current.add(preview)
          const photo: UploadPhoto = { id: crypto.randomUUID(), file: candidate, preview, credit: '', album: '', tags: [], tagInput: '', status: 'ready', error: '', creatingAlbum: false, newAlbum: '', newAlbumId: crypto.randomUUID(), secretAlbumId: '', secret: false }
          setPhotos(current => [...current, photo])
        } catch (error) { rejected.push(`${candidate.name}: ${error instanceof Error ? error.message : '이미지를 읽을 수 없어요.'}`) }
        if (version !== selection.current.version) return
      }
      setError(rejected.join(' / '))
    } finally { if (version === selection.current.version) setValidating(false) }
  }
  function addTags(photo: UploadPhoto) {
    try { update(photo.id, { tags: collectPhotoTags(photo.tags, photo.tagInput), tagInput: '', error: '' }) }
    catch (error) { update(photo.id, { error: (error as Error).message }) }
  }
  async function createAlbum(photo: UploadPhoto) {
    if (albumBusy || busy) return
    const name = photo.newAlbum.trim()
    if (!name || name.length > 80 || [...name].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) { update(photo.id, { error: '앨범 이름을 1~80자로 입력해 주세요.' }); return }
    if (photo.secret) {
      setAlbumBusy(true)
      setBusy(true)
      try {
        const album = readSecretSummary(await secretAlbumRequest('', { id: photo.newAlbumId, name }))
        setSecretAlbums(current => [...current.filter(item => item.id !== album.id), album])
        update(photo.id, { album: name, secretAlbumId: album.id, newAlbum: '', newAlbumId: crypto.randomUUID(), creatingAlbum: false, error: '' })
        setSecretStatus('')
      } catch (error) { update(photo.id, { error: error instanceof Error ? error.message : '비밀 앨범을 만들지 못했어요.' }) }
      finally { setAlbumBusy(false); setBusy(false) }
      return
    }
    setCreatedAlbums(current => [...new Set([...current, name])])
    update(photo.id, { album: name, secretAlbumId: '', newAlbum: '', creatingAlbum: false, error: '' })
  }
  async function upload() {
    if (busy || albumBusy || validating || !pending.length) return
    setError('')
    const jobs = []
    let invalid = false
    for (const photo of pending) {
      try {
        if (photo.creatingAlbum) throw new Error('새 앨범의 만들기 버튼을 눌러 주세요.')
        const metadata = photoUploadMetadata(photo.file.name, photo)
        jobs.push({ photo, metadata }); update(photo.id, { tags: metadata.tags, tagInput: '', error: '' })
      } catch (error) { invalid = true; update(photo.id, { error: (error as Error).message }) }
    }
    if (invalid) { setError('사진별 입력 정보를 확인해 주세요.'); return }
    setBusy(true)
    try {
      const secretJobs = jobs.filter(job => job.photo.secretAlbumId)
      for (const albumId of new Set(secretJobs.map(job => job.photo.secretAlbumId))) {
        const album = secretAlbums.find(item => item.id === albumId)
        if (!album) throw new Error('비밀 앨범을 다시 선택해 주세요.')
        const group = secretJobs.filter(job => job.photo.secretAlbumId === albumId)
        const privatePhotos = []
        for (const { photo, metadata } of group) {
          if (photo.file.size > secretAlbumLimits.fileBytes) throw new Error('비밀 앨범 사진은 한 장당 5MB 이하로 선택해 주세요.')
          const bytes = new Uint8Array(await photo.file.arrayBuffer())
          inspectSecretImage(bytes, photo.file.type)
          await validateProfileImage(photo.file)
          // Chunked conversion avoids spreading an entire image onto the call stack.
          let binary = ''
          for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
          privatePhotos.push({ id: photo.id, mime: photo.file.type, image: btoa(binary), metadata })
        }
        if (privatePhotos.reduce((size, photo) => size + photo.image.length, 0) > secretAlbumLimits.albumBytes) throw new Error('비밀 앨범 이미지 데이터는 한 번에 12MB까지 등록할 수 있어요.')
        group.forEach(({ photo }) => update(photo.id, { status: 'uploading', error: '' }))
        const updated = readSecretSummary(await secretAlbumRequest(`/${albumId}/photos`, { revision: album.revision, photos: privatePhotos }))
        setSecretAlbums(current => current.map(item => item.id === updated.id ? updated : item))
        group.forEach(({ photo }) => update(photo.id, { status: 'staged', error: '' }))
      }
      const publicJobs = jobs.filter(job => !job.photo.secretAlbumId)
      if (!publicJobs.length) { close(); return }
      if (!endpoint) throw new Error('사진 업로드 서버가 아직 연결되지 않았어요.')
      const url = new URL(endpoint)
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || url.port || !/^(?:kirari-stories|kirari-photo-upload)\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) || !['/', '/photos'].includes(url.pathname)) throw new Error('업로드 서버 설정을 확인해 주세요.')
      const config = getFirebaseConfig(import.meta.env)
      if (!config) throw new Error('Firebase 연결을 확인해 주세요.')
      const { getFirebaseAuth } = await import('../lib/firebase')
      const auth = getFirebaseAuth(config)
      await auth.authStateReady()
      if (!auth.currentUser) throw new Error('관리자 로그인이 필요해요.')
      url.searchParams.set('target', 'gallery')
      url.searchParams.set('batch', 'upload')
      const form = new FormData()
      for (const { photo } of publicJobs) {
        await validateProfileImage(photo.file)
        form.append('photos', photo.file)
        update(photo.id, { status: 'uploading', error: '' })
      }
      form.append('metadata', JSON.stringify(publicJobs.map(job => job.metadata)))
      const token = await auth.currentUser.getIdToken()
      const response = await fetch(url, { method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(180000), headers: { Authorization: `Bearer ${token}` }, body: form })
      if (!response.ok) throw new Error(response.status === 401 ? '다시 로그인해 주세요.' : response.status === 403 ? '관리자 권한이 필요해요.' : response.status === 429 ? '잠시 후 다시 등록해 주세요.' : '일괄 등록에 실패했어요. 다시 시도해 주세요.')
      const result = await response.json() as { status?: unknown, results?: { duplicate?: unknown }[] }
      if (result.status !== 'staged' || !Array.isArray(result.results) || result.results.length !== publicJobs.length) throw new Error('접수 결과를 확인하지 못했어요. 다시 시도해 주세요.')
      publicJobs.forEach(({ photo }, index) => update(photo.id, { status: result.results![index].duplicate === true ? 'duplicate' : 'staged', error: '' }))
      close()
    } catch (error) {
      const message = error instanceof Error ? error.message : '등록에 실패했어요.'
      setPhotos(current => current.map(photo => accepted(photo) ? photo : { ...photo, status: 'error', error: message }))
      setError(message)
    }
    finally { setBusy(false) }
  }
  return <form onSubmit={event => { event.preventDefault(); void upload() }}>
    <header className="photo-upload-header"><div className="photo-upload-heading-icon"><ImagePlus size={24} /></div><div><span className="photo-upload-eyebrow">GALLERY UPLOAD</span><h2 id="photo-upload-title">새로운 사진 올리기</h2><p>갤러리의 앨범에 사진을 모아 보세요.</p></div><button className="icon-button" type="button" disabled={busy} onClick={close} aria-label="업로드 창 닫기"><X size={20} /></button></header>
    <div className="photo-upload-selection">
      <label className="photo-upload-file"><Upload size={16} /><span>{validating ? '사진 확인 중…' : photos.length ? '사진 추가하기' : '사진 선택하기'}</span><input type="file" multiple disabled={busy || validating} accept=".apng,image/apng,image/png,image/jpeg,image/webp,image/gif" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void selectPhotos(files) }} /></label>
      <p className="photo-upload-help">공개 앨범은 검증·배포 후 공개돼요. 비밀 앨범은 별도로 저장하며 검색에 표시되지 않아요.</p>
    </div>
    {!photos.length && <div className="photo-upload-empty"><ImagePlus size={40} strokeWidth={1.3} /><p>사진을 여러 장 선택해 주세요.</p></div>}
    <div className="photo-upload-list">{photos.map((photo, index) => <fieldset key={photo.id} className="photo-upload-card" disabled={busy || albumBusy || accepted(photo)} aria-label={`사진 ${index + 1} 정보`}>
      <div className="photo-upload-card-heading"><span>사진 {index + 1}</span><button className="icon-button" type="button" aria-label={`사진 ${index + 1} 선택 취소`} onClick={() => remove(photo)}><X size={16} /></button></div>
      <div className="photo-upload-body">
        <section className="photo-upload-media" aria-label={`사진 ${index + 1} 미리보기`}>
          <div className="photo-upload-preview has-photo"><img src={photo.preview} alt={`선택한 사진 ${index + 1}`} /></div>
          <p className="photo-upload-filename">{photo.file.name} <span>· {(photo.file.size / 1024 / 1024).toFixed(2)} MB</span></p>
        </section>
        <section className="photo-upload-fields" aria-label={`사진 ${index + 1} 분류`}>
          <div className="photo-upload-field"><div className="photo-upload-label-row"><label htmlFor={`album-${photo.id}`}>앨범</label><button type="button" className="photo-upload-text-button" onClick={() => update(photo.id, { creatingAlbum: !photo.creatingAlbum })} aria-expanded={photo.creatingAlbum}><FolderPlus size={14} /> 새 앨범</button></div>
            <select id={`album-${photo.id}`} value={photo.secretAlbumId ? `secret:${photo.secretAlbumId}` : `public:${photo.album}`} onChange={event => {
              const secret = secretAlbums.find(item => `secret:${item.id}` === event.target.value)
              update(photo.id, { album: secret?.name ?? event.target.value.slice(7), secretAlbumId: secret?.id ?? '' })
            }}><option value="public:">미분류</option>{albums.map(name => <option key={name} value={`public:${name}`}>{name}</option>)}{secretAlbums.map(album => <option key={album.id} value={`secret:${album.id}`}>🔒 {album.name}</option>)}</select>
            {photo.creatingAlbum && <div className="photo-upload-album-create"><div className="photo-upload-new-album"><input aria-label={`사진 ${index + 1} 새 앨범 이름`} autoFocus value={photo.newAlbum} onChange={event => update(photo.id, { newAlbum: event.target.value })} maxLength={80} placeholder="새 앨범 이름" /><button type="button" className="soft-button" onClick={() => void createAlbum(photo)}>만들기</button><button className="icon-button" type="button" aria-label="새 앨범 만들기 취소" onClick={() => update(photo.id, { creatingAlbum: false })}><X size={16} /></button></div><label className="photo-upload-secret-toggle"><input type="checkbox" checked={photo.secret} onChange={event => update(photo.id, { secret: event.target.checked })} /> 비밀 앨범으로 만들기</label><small>관리자만 볼 수 있는 앨범이에요.</small></div>}
            {photo.secretAlbumId && <p className="photo-upload-help">비밀 앨범에만 저장돼요. PNG·JPG·WebP·GIF, 한 장당 5MB·2400만 픽셀 이하. 원본 메타데이터는 유지돼요.</p>}
          </div>
          <div className="photo-upload-field"><label htmlFor={`tags-${photo.id}`}>태그 <span className="photo-upload-optional">선택</span></label><div className="photo-upload-tag-input"><input id={`tags-${photo.id}`} value={photo.tagInput} onChange={event => update(photo.id, { tagInput: event.target.value })} placeholder="태그 입력 후 Enter 또는 쉼표" maxLength={820} onKeyDown={event => { if (!event.nativeEvent.isComposing && (event.key === 'Enter' || event.key === ',' || event.key === '，')) { event.preventDefault(); addTags(photo) } }} /><button type="button" className="icon-button" aria-label="태그 추가" onClick={() => addTags(photo)}><Plus size={17} /></button></div>
            {photo.tags.length > 0 && <div className="photo-upload-tags">{photo.tags.map(tag => <button key={tag} type="button" aria-label={`${tag} 태그 삭제`} onClick={() => update(photo.id, { tags: photo.tags.filter(value => value !== tag) })}>#{tag}<X size={12} /></button>)}</div>}
            {suggestedTags.filter(tag => !photo.tags.includes(tag)).length > 0 && <div className="photo-upload-suggestions"><span>기존 태그</span>{suggestedTags.filter(tag => !photo.tags.includes(tag)).map(tag => <button key={tag} type="button" disabled={photo.tags.length >= 20} onClick={() => update(photo.id, { tags: [...photo.tags, tag] })}>#{tag}</button>)}</div>}
          </div>
          <label>저작권자 <span className="photo-upload-required">필수</span><input value={photo.credit} onChange={event => update(photo.id, { credit: event.target.value })} placeholder="작가 이름을 입력해 주세요" maxLength={120} required />{photo.credit.trim() && <small>{copyrightLabel(photo.credit)}</small>}</label>
        </section>
      </div>
      <div className="photo-upload-card-status" aria-live="polite">{photo.status === 'uploading' ? '접수 중…' : photo.status === 'staged' ? '접수 완료' : photo.status === 'duplicate' ? '이미 접수된 사진 · 기존 정보 유지' : ''}{photo.error && <p className="photo-upload-error" role="alert">{photo.error}</p>}</div>
    </fieldset>)}</div>
    <div className="photo-upload-notices">{!endpoint && <p role="status">공개 사진 업로드 서버 연결 전이에요.</p>}{secretStatus && <p role="status">{secretStatus}</p>}{error && <p className="photo-upload-error" role="alert">{error}</p>}</div>
    <footer className="photo-upload-footer"><span role="status">{photos.length ? `${photos.length}장 중 ${completed}장 접수${busy ? ' 중…' : ''}` : '사진을 선택해 주세요.'}</span><div><button className="soft-button" type="button" disabled={busy || albumBusy} onClick={close}>닫기</button><button className="primary-button" type="submit" disabled={busy || albumBusy || validating || !pending.length || !endpoint && pending.some(photo => !photo.secretAlbumId)}><Upload size={15} />{busy ? '등록 중…' : pending.length ? `${pending.length}장 등록하기` : '사진 등록하기'}</button></div></footer>
  </form>
}
