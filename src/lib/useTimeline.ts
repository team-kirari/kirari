import { useEffect, useRef, useState } from 'react'
import { getFirebaseConfig } from './auth'
import { defaultTimeline, mergeTimeline, timelineReadError } from './timeline'
import type { TimelineEvent } from './timeline'
import type { createTimelineStore } from './firebase-timeline'

export function useTimeline() {
  const [items, setItems] = useState(defaultTimeline)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(() => getFirebaseConfig(import.meta.env) ? '' : 'Firebase 연결 설정이 없어 기본 타임라인을 표시합니다. 공용 편집에는 Firebase 설정이 필요해요.')
  const store = useRef<ReturnType<typeof createTimelineStore> | null>(null)
  const saving = useRef(false)
  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    const config = getFirebaseConfig(import.meta.env)
    const timeout = window.setTimeout(() => {
      if (active) setStatus('공용 저장소 연결을 기다리고 있어요. 기본 타임라인을 표시합니다.')
    }, 10000)
    if (config) void import('./firebase-timeline').then(({ createTimelineStore }) => {
      if (!active) return
      store.current = createTimelineStore(config)
      unsubscribe = store.current.subscribe(events => {
        if (!active) return
        window.clearTimeout(timeout); setItems(mergeTimeline(events)); setReady(true); setStatus('')
      }, error => { if (active) { window.clearTimeout(timeout); setReady(false); setStatus(timelineReadError(error)) } })
    }).catch(() => { if (active) { window.clearTimeout(timeout); setStatus('공용 저장소에 연결하지 못했어요.') } })
    else { window.clearTimeout(timeout) }
    return () => { active = false; window.clearTimeout(timeout); unsubscribe?.(); store.current = null }
  }, [])
  async function save(item: TimelineEvent) {
    if (!ready || !store.current || saving.current) return false
    saving.current = true; setBusy(true); setStatus('')
    try {
      await store.current.save(item)
      setStatus('공개 타임라인에 저장했어요.')
      return true
    } catch (error) {
      setStatus(error instanceof Error && error.message === 'timeline-conflict'
        ? '다른 관리자가 먼저 수정했어요. 편집을 닫고 최신 내용으로 다시 열어 주세요.'
        : '저장하지 못했어요. 날짜, 연결 상태와 관리자 권한을 확인해 주세요.')
      return false
    } finally { saving.current = false; setBusy(false) }
  }
  return { items, ready, busy, status, save }
}
