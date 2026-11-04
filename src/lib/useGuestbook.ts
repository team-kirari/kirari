import { useEffect, useRef, useState } from 'react'
import { getFirebaseConfig } from './auth'
import { guestText } from './guestbook'
import type { GuestNote } from './guestbook'
import type { createGuestbookStore } from './firebase-guestbook'

export function useGuestbook() {
  const [notes, setNotes] = useState<GuestNote[]>([])
  const [status, setStatus] = useState('방명록을 불러오는 중…')
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const store = useRef<ReturnType<typeof createGuestbookStore> | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    const config = getFirebaseConfig(import.meta.env)
    function fail() { if (active) { setReady(false); setStatus('방명록 연결을 확인해 주세요. 다시 불러오기를 눌러 재시도할 수 있어요.') } }
    if (config) void import('./firebase-guestbook').then(sdk => {
      if (!active) return
      store.current = sdk.createGuestbookStore(config)
      unsubscribe = store.current.subscribe(items => {
        if (active) { setNotes(items); setReady(true); setStatus('') }
      }, fail)
    }).catch(fail)
    return () => { active = false; store.current = null; unsubscribe?.() }
  }, [attempt])
  const configured = Boolean(getFirebaseConfig(import.meta.env))
  return { notes, ready, busy, error, status: configured ? status : 'Firebase 연결 설정 후 방명록을 사용할 수 있어요.',
    retry() { setReady(false); setStatus('방명록을 불러오는 중…'); setAttempt(value => value + 1) },
    async addNote(value: string): Promise<boolean> {
      if (pending.current || !ready || !store.current || !guestText(value)) return false
      pending.current = true; setBusy(true); setError('')
      try { await store.current.send(value); return true }
      catch { setError('저장하지 못했어요. 5초 뒤 다시 시도해 주세요. 계속 실패하면 연결과 Firebase 규칙을 확인해 주세요.'); return false }
      finally { pending.current = false; setBusy(false) }
    },
    async removeNote(id: string): Promise<boolean> {
      if (pending.current || !ready || !store.current) return false
      pending.current = true; setBusy(true); setError('')
      try { await store.current.remove(id); return true }
      catch { setError('삭제하지 못했어요. 연결과 관리자 권한을 확인해 주세요.'); return false }
      finally { pending.current = false; setBusy(false) }
    },
  }
}
