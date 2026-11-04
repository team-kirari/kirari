import { useEffect, useRef, useState } from 'react'
import type { FormEvent, SyntheticEvent } from 'react'
import { Minus, Send } from 'lucide-react'
import { art } from '../content'
import { getFirebaseConfig } from '../lib/auth'
import { characterNames, MESSAGE_MAX_LENGTH, messageText } from '../lib/messages'
import type { MessageWriter, PublicMessage } from '../lib/messages'
import type { createMessageStore } from '../lib/firebase-messages'

export function Messages({ writer, admin }: { writer: MessageWriter | null, admin: boolean }) {
  const [messages, setMessages] = useState<PublicMessage[]>([])
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('메시지를 불러오는 중…')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [selection, setSelection] = useState<{ id: string, confirming: boolean } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const deletePending = useRef(false)
  const messageButtons = useRef(new Map<string, HTMLButtonElement>())
  const [retry, setRetry] = useState(0)
  const [store, setStore] = useState<ReturnType<typeof createMessageStore> | null>(null)
  const lines = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)
  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    const config = getFirebaseConfig(import.meta.env)
    if (!config) return
    void import('../lib/firebase-messages').then(sdk => {
      if (!active) return
      const connection = sdk.createMessageStore(config)
      setStore(connection)
      unsubscribe = connection.subscribe(items => {
        if (!active) return
        setMessages(items)
        setStatus('')
      }, () => { if (active) setStatus('메시지를 불러오지 못했어요. 연결과 Firebase 규칙을 확인해 주세요.') })
    }).catch(() => { if (active) setStatus('메신저를 연결하지 못했어요.') })
    return () => { active = false; unsubscribe?.() }
  }, [retry])
  useEffect(() => {
    if (lines.current && followLatest.current) lines.current.scrollTop = lines.current.scrollHeight
  }, [messages])
  useEffect(() => {
    const element = lines.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      if (followLatest.current) element.scrollTop = element.scrollHeight
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  function measureExpansion(event: SyntheticEvent<HTMLElement>) {
    const element = event.currentTarget
    const scene = element.closest('.desktop-scene')
    if (!scene) return
    const bounds = scene.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    element.style.setProperty('--messages-expand-up', `${Math.max(0, Math.min(70, rect.top - bounds.top - 8))}px`)
    element.style.setProperty('--messages-expand-down', `${Math.max(0, Math.min(70, bounds.bottom - rect.bottom - 8))}px`)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!writer || !store || sending || !messageText(draft)) return
    setSending(true)
    setError('')
    try { await store.send(writer, draft); setDraft('') }
    catch { setError('전송하지 못했어요. 연결과 관리자 담당 캐릭터 설정을 확인한 뒤 다시 시도해 주세요.') }
    finally { setSending(false) }
  }

  function cancelDelete() {
    if (deletePending.current) return
    if (selection) messageButtons.current.get(selection.id)?.focus()
    setSelection(null)
  }

  async function removeMessage(id: string) {
    if (!admin || !store || selection?.id !== id || !selection.confirming || deletePending.current) return
    deletePending.current = true
    setDeleting(id)
    setError('')
    try {
      await store.remove(id)
      setSelection(null)
      lines.current?.focus({ preventScroll: true })
    } catch { setError('삭제하지 못했어요. 연결과 관리자 권한을 확인한 뒤 다시 시도해 주세요.') }
    finally { deletePending.current = false; setDeleting(null) }
  }

  const configured = Boolean(getFirebaseConfig(import.meta.env))
  return <section className="widget messages" data-widget-id="messages" aria-label="공개 메신저" onPointerEnter={measureExpansion} onFocusCapture={measureExpansion} onKeyDown={event => {
    if (event.key === 'Escape' && selection) { event.stopPropagation(); cancelDelete() }
  }}>
    <div className="messages-panel">
    <div className="chat-lines" ref={lines} role="log" aria-label="켄지와 키요의 공개 메시지" tabIndex={0} data-widget-scroll onScroll={event => {
      const element = event.currentTarget
      followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24
    }}>
      {messages.map(message => <div className={`chat-line ${message.character === 'kiyo' ? 'self' : ''}`} key={message.id}>
        <img src={message.character === 'kenji' ? art.kenjiSD : art.kiyoSD} alt="" />
        <span>{admin ? <button type="button" className="message-select" ref={element => {
          if (element) messageButtons.current.set(message.id, element)
          else messageButtons.current.delete(message.id)
        }} aria-label={`${characterNames[message.character]} 메시지 삭제 메뉴: ${message.text}`} aria-expanded={selection?.id === message.id} disabled={deleting !== null} onClick={() => {
          setSelection(previous => previous?.id === message.id ? null : { id: message.id, confirming: false })
        }}><strong className="message-author">{characterNames[message.character]}</strong>{message.text}</button>
          : <><strong className="message-author">{characterNames[message.character]}</strong>{message.text}</>}</span>
        {admin && selection?.id === message.id && <div className="message-delete-actions" data-no-drag>
          {selection.confirming ? <>
            <button type="button" className="message-delete-confirm" autoFocus aria-label="이 메시지 삭제 확인" disabled={deleting !== null} onClick={() => void removeMessage(message.id)}>{deleting === message.id ? '삭제 중…' : '확인'}</button>
            <button type="button" className="message-delete-cancel" disabled={deleting !== null} onClick={cancelDelete}>취소</button>
          </> : <button type="button" className="message-delete-trigger" aria-label="메시지 삭제" onClick={() => setSelection({ id: message.id, confirming: true })}><Minus size={15} /></button>}
        </div>}
      </div>)}
      {!messages.length && !status && <p className="message-notice">아직 남겨진 메시지가 없어요.</p>}
    </div>
    <p className="message-notice" role="status">{!configured ? 'Firebase 연결 후 메시지를 볼 수 있어요.' : status}</p>
    {configured && status && status !== '메시지를 불러오는 중…' && <button className="bare message-retry" data-no-drag onClick={() => setRetry(value => value + 1)}>다시 불러오기</button>}
    {writer && <form onSubmit={event => void submit(event)} className="message-form" data-no-drag>
      <input aria-label="메시지 입력" maxLength={MESSAGE_MAX_LENGTH} placeholder="메시지 입력…" value={draft} disabled={sending} onChange={event => setDraft(event.target.value)} />
      <button aria-label="모두에게 메시지 게시" type="submit" disabled={!store || sending || !messageText(draft)}><Send size={16} /></button>
    </form>}
    {error && <p className="message-notice" role="alert">{error}</p>}
    {sending && <span className="micro" role="status">게시 중…</span>}
    </div>
  </section>
}
