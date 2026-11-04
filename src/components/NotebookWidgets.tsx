import { useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import { ArrowUpRight, Heart, MessageCircle, Send } from 'lucide-react'

export type GuestNotesProps = { notes: string[], addNote: (message: string) => void }

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

export function GuestWidget({ notes, addNote }: GuestNotesProps) {
  const [draft, setDraft] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim()) return
    addNote(draft)
    setDraft('')
  }
  return <section className="widget guest-widget" data-widget-id="guest" aria-label="방명록 위젯">
    <div className="notebook-heading"><span><MessageCircle size={15} />방명록</span><small>GUEST BOOK</small></div>
    <div className="guest-memos" aria-live="polite" aria-relevant="additions text">
      {notes.length ? notes.slice(0, 1).map((note, index) => <article className="guest-memo" key={`${index}-${note}`}>
        <Heart size={12} aria-hidden="true" /><p>{note}</p>
      </article>) : <div className="guest-memo guest-memo-empty"><Heart size={17} aria-hidden="true" /><p>첫 인사를 남겨 주세요</p></div>}
    </div>
    <form className="guest-widget-form" onSubmit={submit} data-no-drag>
      <input aria-label="방명록 한 줄" aria-describedby="guest-widget-notice" maxLength={180} placeholder="짧은 인사를 남겨 주세요…" value={draft} onChange={event => setDraft(event.target.value)} />
      <button type="submit" aria-label="방명록에 한 줄 남기기" disabled={!draft.trim()}><Send size={15} /></button>
    </form>
    <p className="guest-widget-notice" id="guest-widget-notice">화면 시연 · 새로고침하면 사라져요</p>
  </section>
}
