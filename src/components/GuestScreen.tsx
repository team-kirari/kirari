import { useState } from 'react'
import { ArrowUpRight, Heart, MessageCircle } from 'lucide-react'
import { art } from '../content'
import type { GuestNotesProps } from './NotebookWidgets'

export function GuestScreen({ guest, admin }: GuestNotesProps & { admin: boolean }) {
  const [draft, setDraft] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  return <div className="guest-layout">
    <div className="guest-intro"><img src={art.pair} alt="켄지와 키요" /><span className="category-tag">공개 방명록</span><h2>한 줄 남기기</h2><p>로그인 없이 인사를 남길 수 있어요.<br />전체 방명록에서 5초에 한 번 작성할 수 있어요.</p></div>
    <div><form className="guest-form" onSubmit={event => {
      event.preventDefault()
      void guest.addNote(draft).then(saved => { if (saved) setDraft('') })
    }}><label htmlFor="guest-message">메시지</label><textarea id="guest-message" required maxLength={180} placeholder="메시지를 적어 주세요." value={draft} disabled={guest.busy} onChange={event => setDraft(event.target.value)} /><div><span>{draft.length} / 180</span><button className="primary-button" type="submit" disabled={!guest.ready || guest.busy || !draft.trim()}>{guest.busy ? '처리 중…' : '인사 남기기'} <ArrowUpRight size={16} /></button></div></form>
      <p className="guest-feedback" role="status">{guest.status || (guest.busy ? '처리 중…' : '최근 방명록 30개를 보여드려요.')}</p>
      {!guest.ready && <button className="soft-button" onClick={guest.retry}>다시 불러오기</button>}
      {guest.error && <p className="guest-feedback" role="alert">{guest.error}</p>}
      <div className="guest-notes" aria-live="polite">{guest.notes.map(note => <article key={note.id}><Heart size={16} /><p>{note.text}</p><span>방문자 · <time dateTime={new Date(note.createdAt).toISOString()}>{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(note.createdAt)}</time></span>
        {admin && <div className="guest-delete">{selected === note.id ? <><span>이 인사를 삭제할까요?</span><button className="soft-button" disabled={guest.busy} onClick={() => void guest.removeNote(note.id).then(removed => { if (removed) setSelected(null) })}>삭제 확인</button><button className="soft-button" disabled={guest.busy} onClick={() => setSelected(null)}>취소</button></> : <button className="soft-button" disabled={guest.busy} onClick={() => setSelected(note.id)}>삭제</button>}</div>}
      </article>)}{guest.ready && !guest.notes.length && <div className="empty-note"><MessageCircle size={26} /><p>아직 남겨진 메시지가 없어요.</p></div>}</div>
    </div>
  </div>
}
