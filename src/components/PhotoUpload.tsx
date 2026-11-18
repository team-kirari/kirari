import { useRef, useState } from 'react'
import { validateProfileImage } from '../lib/profile-images'
import { getFirebaseConfig } from '../lib/auth'
import { copyrightLabel } from '../lib/gallery-catalog'

export function PhotoUpload() {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  return <><button className="soft-button" onClick={() => { setOpen(true); dialog.current?.showModal() }}>사진 업로드</button>
    <dialog ref={dialog} className="photo-upload-dialog" onCancel={event => { if (busy) event.preventDefault() }} onClose={() => setOpen(false)} aria-label="사진 등록">
      {open && <UploadForm busy={busy} setBusy={setBusy} close={() => dialog.current?.close()} />}
    </dialog></>
}

function UploadForm({ close, busy, setBusy }: { close: () => void, busy: boolean, setBusy: (value: boolean) => void }) {
  const [credit, setCredit] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const [target, setTarget] = useState('gallery')
  const [message, setMessage] = useState('')
  const endpoint = import.meta.env.VITE_PHOTO_UPLOAD_URL as string | undefined
  async function upload() {
    if (busy) return
    const photo = file.current?.files?.[0]
    setMessage('')
    if (!photo || !credit.trim()) { setMessage('사진과 저작권자 이름을 입력해 주세요.'); return }
    setBusy(true)
    try {
      if (!endpoint) throw new Error('사진 업로드 서버가 아직 연결되지 않았어요.')
      const url = new URL(endpoint)
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || url.port || !/^(?:kirari-stories|kirari-photo-upload)\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) || !['/', '/photos'].includes(url.pathname)) throw new Error('업로드 서버 설정을 확인해 주세요.')
      const config = getFirebaseConfig(import.meta.env)
      if (!config) throw new Error('Firebase 연결을 확인해 주세요.')
      const { getFirebaseAuth } = await import('../lib/firebase')
      const auth = getFirebaseAuth(config)
      await auth.authStateReady()
      if (!auth.currentUser) throw new Error('관리자 로그인이 필요해요.')
      const token = await auth.currentUser.getIdToken()
      await validateProfileImage(photo)
      url.searchParams.set('target', target)
      const response = await fetch(url, { method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': photo.type, 'X-Photo-Credit': encodeURIComponent(credit.trim()) }, body: photo })
      if (!response.ok) throw new Error(response.status === 401 ? '다시 로그인해 주세요.' : response.status === 403 ? '관리자 권한이 필요해요.' : response.status === 429 ? '등록 시도가 많아요. 잠시 후 다시 시도해 주세요.' : '등록에 실패했어요. 정지 이미지인지 확인하고 다시 시도해 주세요.')
      setMessage('비공개 저장소에 접수했어요. 검증·배포가 완료되면 사이트에 표시돼요. 배포 후 새로고침하고, 프로필 사진은 관리자 편집창에서 선택해 주세요. 반영되지 않으면 저장소 Actions 결과를 확인해 주세요.')
      if (file.current) file.current.value = ''
    } catch (error) { setMessage(error instanceof Error ? error.message : '등록에 실패했어요.') }
    finally { setBusy(false) }
  }
  return <form onSubmit={event => { event.preventDefault(); void upload() }}>
    <h2>사진 등록</h2><p>등록한 사진은 사이트에 공개돼요. 사진과 저작권자 이름은 비공개 저장소에 저장해요. 로그인한 관리자만 업로드할 수 있어요.</p>
    <p>정지 PNG·JPEG·WebP·GIF, 5MB·4096px·1600만 픽셀 이하. 검증을 통과하면 메타데이터를 제거한 WebP로 공개돼요.</p>
    {!endpoint && <p role="status">업로드 서버 연결 전이에요.</p>}
    <fieldset disabled={busy || !endpoint}>
      <label>등록 위치<select value={target} onChange={event => setTarget(event.target.value)}><option value="gallery">갤러리</option>{(['kenji', 'kiyo'] as const).flatMap(person => (['old', 'new'] as const).map(version => <option key={`${person}/${version}`} value={`profiles/${person}/${version}`}>{person === 'kenji' ? '켄지' : '키요'} · {version === 'old' ? '구일러스트' : '신일러스트'}</option>))}</select></label>
      <label>사진<input ref={file} type="file" required accept="image/png,image/jpeg,image/webp,image/gif" /></label>
      <label>저작권자<input value={credit} onChange={event => setCredit(event.target.value)} placeholder="이름만 입력해 주세요" maxLength={120} required /></label>
      {credit.trim() && <p>표시: {copyrightLabel(credit)}</p>}
      <button className="primary-button" type="submit">{busy ? '등록 중…' : '공개 사진 등록'}</button>
    </fieldset>
    {message && <p role="status">{message}</p>}
    <button className="soft-button" type="button" disabled={busy} onClick={close}>닫기</button>
  </form>
}
