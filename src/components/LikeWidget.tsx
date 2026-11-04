import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Heart } from 'lucide-react'
import { seoulDate } from '../lib/dday'
import { addLike, DAILY_LIKE_LIMIT, emptyLikes, LIKE_STORAGE_KEY, readLikes, resetLikes } from '../lib/likes'

type HeartBurst = { id: number, particles: { size: number, style: CSSProperties }[] }

function readState() {
  try { return { count: readLikes(window.localStorage, seoulDate()), error: '' } }
  catch { return { count: emptyLikes(seoulDate()), error: '저장된 좋아요를 읽을 수 없어요. 브라우저 저장 설정을 확인해 주세요.' } }
}

export function LikeWidget() {
  const [state, setState] = useState(readState)
  const [busy, setBusy] = useState(false)
  const [bursts, setBursts] = useState<HeartBurst[]>([])
  const burstId = useRef(0)
  const timers = useRef(new Set<number>())
  const pending = useRef(false)
  useEffect(() => {
    const activeTimers = timers.current
    return () => { for (const timer of activeTimers) window.clearTimeout(timer); activeTimers.clear() }
  }, [])

  function popHearts() {
    const id = ++burstId.current
    let lifetime = 0
    const particles = Array.from({ length: 3 }, () => {
      const duration = 850 + Math.random() * 350
      const delay = Math.random() * 25
      lifetime = Math.max(lifetime, duration + delay)
      return {
        size: Math.round(9 + Math.random() * 8),
        style: {
          '--heart-drift': `${-34 + Math.random() * 68}px`,
          '--heart-rise': `${-45 - Math.random() * 45}px`,
          '--heart-turn': `${-30 + Math.random() * 60}deg`,
          left: `${-3 + Math.random() * 10}px`,
          animationDuration: `${duration}ms`,
          animationDelay: `${delay}ms`,
        } as CSSProperties,
      }
    })
    setBursts(previous => [...previous.slice(-9), { id, particles }])
    const timer = window.setTimeout(() => {
      setBursts(previous => previous.filter(value => value.id !== id))
      timers.current.delete(timer)
    }, Math.ceil(lifetime) + 50)
    timers.current.add(timer)
  }
  useEffect(() => {
    const refresh = () => {
      if (pending.current) return
      const next = readState()
      setState(previous => {
        if (next.error) return next.error === previous.error ? previous : next
        const a = previous.count, b = next.count
        return a.total === b.total && a.day === b.day && a.used === b.used && previous.error === next.error ? previous : next
      })
    }
    const storage = (event: StorageEvent) => { if (event.key === LIKE_STORAGE_KEY || event.key === null) refresh() }
    const timer = window.setInterval(refresh, 1000)
    window.addEventListener('storage', storage)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('storage', storage)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  async function update(reset = false) {
    if (reset && !import.meta.env.DEV) return
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      const save = () => {
        const day = seoulDate()
        if (reset) {
          setState({ count: resetLikes(window.localStorage, day), error: '' })
          setBursts([])
          return
        }
        const before = readLikes(window.localStorage, day)
        const count = addLike(window.localStorage, day)
        setState({ count, error: '' })
        if (count.total > before.total) popHearts()
      }
      if (navigator.locks) await navigator.locks.request(LIKE_STORAGE_KEY, save)
      else save()
    } catch {
      setState(previous => ({ ...previous, error: '좋아요를 저장할 수 없어요. 저장 설정을 확인한 뒤 다시 시도해 주세요.' }))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  const blocked = busy || !!state.error || state.count.used >= DAILY_LIKE_LIMIT || state.count.total === Number.MAX_SAFE_INTEGER
  return <div className={`floating-chip heart-chip like-widget ${state.count.used ? 'liked' : ''}`} data-widget-id="heart">
    <button className="bare heart-action" aria-label={state.error ? '좋아요 저장 오류' : `좋아요 누적 ${state.count.total}회`} aria-describedby={state.error ? 'like-status' : undefined} disabled={blocked} onClick={() => void update()}>
      <span className="like-heart-origin" aria-hidden="true">
        <Heart size={16} fill={state.count.used ? 'currentColor' : 'none'} />
        {bursts.map(burst => <span className="like-burst" key={burst.id}>
          {burst.particles.map((particle, index) => <Heart key={index} className="like-particle" size={particle.size} style={particle.style} fill="currentColor" />)}
        </span>)}
      </span>
      <span>좋아요 <strong aria-live="polite" aria-atomic="true">{state.error ? '—' : state.count.total.toLocaleString('ko-KR')}</strong></span>
    </button>
    {state.error && <span className="like-status" id="like-status" role="status">{state.error}</span>}
    {import.meta.env.DEV && <button className="bare like-reset" data-no-drag disabled={busy} onClick={() => void update(true)} aria-label="개발용 좋아요 누적 횟수와 오늘 사용 횟수 초기화">초기화 · 개발용</button>}
  </div>
}
