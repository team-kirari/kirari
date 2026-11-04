import { useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import { ArrowUpRight, Heart, MessageCircle, Send } from 'lucide-react'

import type { useGuestbook } from '../lib/useGuestbook'

export type GuestNotesProps = { guest: ReturnType<typeof useGuestbook> }

export function StoryWidget({ onOpen }: { onOpen: (event: MouseEvent<HTMLButtonElement>) => void }) {
  return <section className="widget story-widget" data-widget-id="story" aria-label="이야기 위젯">
    <button className="story-bookmark" onClick={onOpen} aria-label="이야기 펼치기">
      <span className="story-book-pages" aria-hidden="true"><ArrowUpRight size={17} /></span>
      <span className="story-ribbon" aria-hidden="true" />
      <span className="story-book-cover" aria-hidden="true">
        <span className="story-cover-front"><span>story</span></span>
        <span className="story-cover-back" />
      </span>
    </button>
  </section>
}

export function GuestWidget({ guest }: GuestNotesProps) {
  const [draft, setDraft] = useState('')
  const notice = guest.busy ? '처리 중…' : guest.error || guest.status
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim()) return
    if (await guest.addNote(draft)) setDraft('')
  }
  return <section className="widget guest-widget" data-widget-id="guest" aria-label="방명록 위젯">
    <div className="notebook-heading"><span><MessageCircle size={15} />방명록</span><small>GUEST BOOK</small></div>
    <div className="guest-memos" aria-live="polite" aria-relevant="additions text">
      {guest.notes.length ? guest.notes.slice(0, 1).map(note => <article className="guest-memo" key={note.id}>
        <Heart size={12} aria-hidden="true" /><p>{note.text}</p>
      </article>) : <div className="guest-memo guest-memo-empty"><Heart size={17} aria-hidden="true" /><p>첫 인사를 남겨 주세요</p></div>}
    </div>
    <form className="guest-widget-form" onSubmit={event => void submit(event)} data-no-drag>
      <input aria-label="방명록 한 줄" aria-describedby={notice ? 'guest-widget-notice' : undefined} maxLength={180} placeholder="짧은 인사를 남겨 주세요…" value={draft} disabled={guest.busy} onChange={event => setDraft(event.target.value)} />
      <button type="submit" aria-label="방명록에 한 줄 남기기" disabled={!draft.trim() || !guest.ready || guest.busy}><Send size={15} /></button>
    </form>
    {notice && <p role="status" className="guest-widget-notice" id="guest-widget-notice">{notice}</p>}
  </section>
}
