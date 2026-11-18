import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Plus, ListOrdered, X } from 'lucide-react'
import { useTimeline } from '../lib/useTimeline'
import { parseTimelineEvent, timelineBodyBlocks } from '../lib/timeline'
import type { TimelineEvent } from '../lib/timeline'
import { TimelineOrderDialog } from './TimelineOrderDialog'
import './ArchiveScreens.css'

export function TimelineScreen({ admin }: { admin: boolean }) {
  const timeline = useTimeline()
  const [draft, setDraft] = useState<TimelineEvent | null>(null)
  const [ordering, setOrdering] = useState<TimelineEvent[] | null>(null)
  const [remove, setRemove] = useState(false)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const overview = useRef<HTMLDivElement>(null)
  const selected = useRef('')
  const dialog = useRef<HTMLDialogElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const motion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' as const : 'smooth' as const
  useLayoutEffect(() => {
    const root = overview.current
    if (!root || !('IntersectionObserver' in window)) return
    // Reveal in reading order within the horizontal viewport. Offscreen events
    // receive their own short sequence when scrolled into view.
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) =>
        a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      )
      visible.forEach((entry, index) => {
        const event = entry.target as HTMLElement
        event.style.setProperty('--timeline-reveal-delay', `${index * 100}ms`)
        event.dataset.revealed = 'true'
        observer.unobserve(event)
      })
    }, { root, threshold: .1 })
    root.dataset.sequenceReady = 'true'
    root.querySelectorAll('.timeline-overview-track>li:not([data-revealed])').forEach(event => observer.observe(event))
    return () => observer.disconnect()
  }, [timeline.items])
  useEffect(() => {
    const root = overview.current
    if (!root) return
    const wheel = (event: WheelEvent) => {
      if (detailOpen || window.matchMedia('(max-width:700px)').matches || event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? root.clientWidth : 1)
      const next = Math.max(0, Math.min(root.scrollWidth - root.clientWidth, root.scrollLeft + delta))
      if (next === root.scrollLeft) return
      event.preventDefault()
      root.scrollLeft = next
    }
    root.addEventListener('wheel', wheel, { passive: false })
    return () => root.removeEventListener('wheel', wheel)
  }, [timeline.items, detailOpen])
  useEffect(() => {
    const root = panel.current
    if (!root || !detailOpen) return
    const card = surface.current
    if (!card) return
    const source = overview.current?.querySelector<HTMLElement>(`[data-overview-id="${selected.current}"] .overview-event`)
    if (source && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const from = source.getBoundingClientRect(), to = card.getBoundingClientRect()
      card.animate([
        { transform: `translate(${from.x + from.width / 2 - to.x - to.width / 2}px, ${from.y + from.height / 2 - to.y - to.height / 2}px) scale(${from.width / to.width}, ${from.height / to.height})`, opacity: .3 },
        { transform: 'none', opacity: 1 },
      ], { duration: 480, easing: 'cubic-bezier(.22,1,.36,1)' })
    }
    let frame = 0, wheelTotal = 0, wheelTime = 0, lockedUntil = 0
    const entries = () => [...root.querySelectorAll<HTMLElement>('.timeline-entry')]
    const mobile = () => window.matchMedia('(max-width:700px)').matches
    const distance = (item: HTMLElement) => Math.abs(mobile() ? item.offsetTop - root.scrollTop : item.offsetLeft - root.scrollLeft)
    const nearest = () => entries().reduce((best, item) => distance(item) < distance(best) ? item : best, entries()[0])
    const update = () => {
      const entry = nearest()
      if (entry) { selected.current = entry.dataset.eventId ?? ''; setActiveId(selected.current) }
    }
    const scroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update) }
    const wheel = (event: WheelEvent) => {
      if (mobile() || closing.current || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return
      // Read a long story vertically before advancing to the next event.
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('.timeline-story') : null
      if (target && (event.deltaY > 0 ? target.scrollTop + target.clientHeight < target.scrollHeight - 2 : target.scrollTop > 2)) return
      const all = entries(), current = nearest(), index = all.indexOf(current)
      const direction = Math.sign(event.deltaY), next = all[index + direction]
      if (!next) return
      event.preventDefault()
      const now = performance.now()
      if (now < lockedUntil) return
      if (now - wheelTime > 180 || Math.sign(wheelTotal) !== direction) wheelTotal = 0
      wheelTime = now
      wheelTotal += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? root.clientHeight : 1)
      if (Math.abs(wheelTotal) < 45) return
      wheelTotal = 0; lockedUntil = now + 700
      root.scrollTo({ left: next.offsetLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    }
    const align = () => {
      const target = entries().find(item => item.dataset.eventId === selected.current) ?? entries()[0]
      if (target) root.scrollTo({ left: mobile() ? 0 : target.offsetLeft, top: mobile() ? target.offsetTop : 0, behavior: 'instant' })
      scroll()
    }
    const observer = new ResizeObserver(align)
    observer.observe(root)
    root.addEventListener('scroll', scroll, { passive: true })
    root.addEventListener('wheel', wheel, { passive: false })
    align(); root.focus({ preventScroll: true })
    return () => { observer.disconnect(); root.removeEventListener('scroll', scroll); root.removeEventListener('wheel', wheel); cancelAnimationFrame(frame) }
  }, [timeline.items, detailOpen])
  useEffect(() => { if (!admin) dialog.current?.close() }, [admin])
  function open(id: string) { selected.current = id; setActiveId(id); setDetailOpen(true) }
  async function close() {
    if (closing.current) return
    closing.current = true
    const card = surface.current
    const source = overview.current?.querySelector<HTMLElement>(`[data-overview-id="${selected.current}"] .overview-event`)
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const animations: Promise<Animation>[] = []
      if (backdrop.current) {
        const current = getComputedStyle(backdrop.current)
        animations.push(backdrop.current.animate([
          { backdropFilter: current.backdropFilter, backgroundColor: current.backgroundColor },
          { backdropFilter: 'blur(0px)', backgroundColor: '#35445e00' },
        ], { duration: 280, easing: 'ease-out', fill: 'forwards' }).finished)
      }
      if (card && source) {
        const from = card.getBoundingClientRect(), to = source.getBoundingClientRect()
        animations.push(card.animate([
          { transform: 'none', opacity: 1 },
          { transform: `translate(${to.x + to.width / 2 - from.x - from.width / 2}px, ${to.y + to.height / 2 - from.y - from.height / 2}px) scale(${to.width / from.width}, ${to.height / from.height})`, opacity: 0 },
        ], { duration: 280, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished)
      }
      await Promise.allSettled(animations)
    }
    restoreOverview()
    closing.current = false
  }
  function restoreOverview() {
    setDetailOpen(false)
    requestAnimationFrame(() => overview.current?.querySelector<HTMLButtonElement>(`[data-overview-id="${selected.current}"]`)?.focus({ preventScroll: true }))
  }
  function jump(id: string) {
    const root = panel.current
    const entry = root?.querySelector<HTMLElement>(`[data-event-id="${id}"]`)
    if (root && entry && !closing.current) {
      const mobile = window.matchMedia('(max-width:700px)').matches
      root.scrollTo({ left: mobile ? 0 : entry.offsetLeft, top: mobile ? entry.offsetTop : 0, behavior: motion() })
    }
  }
  function step(direction: number) {
    const index = timeline.items.findIndex(item => item.id === activeId)
    const next = timeline.items[index + direction]
    if (next) jump(next.id)
  }
  function edit(item: TimelineEvent) { setDraft({ ...item }); setRemove(false); setError(''); dialog.current?.showModal() }
  async function save(deleted = false) {
    if (!draft || !admin) return
    if (!parseTimelineEvent(draft.id, { ...Object.fromEntries(Object.entries(draft).filter(([key]) => key !== 'id')), revision: draft.revision + 1, deleted })) {
      setError('사건 제목·내용과 올바른 연도·월·일을 입력해 주세요.'); return
    }
    if (await timeline.save({ ...draft, deleted })) dialog.current?.close()
  }
  const yearGroups = timeline.items.reduce<{ year: number; count: number; id: string }[]>((groups, item) => {
    const last = groups.at(-1)
    if (last?.year === item.year) last.count++
    else groups.push({ year: item.year, count: 1, id: item.id })
    return groups
  }, [])
  return <>
    {timeline.status && <p role="status">{timeline.status}</p>}
    {admin && timeline.ready && <div className="archive-toolbar timeline-toolbar"><button className="primary-button" disabled={!timeline.ready || timeline.busy} onClick={() => edit({ id: crypto.randomUUID(), ...(timeline.items.some(item => item.order !== undefined) ? { order: Math.max(...timeline.items.map(item => item.order ?? -1)) + 1 } : {}), year: 2050, month: 12, day: 0, dateLabel: '', title: '', body: '', revision: 0, deleted: false })}><Plus size={15} /> 사건 추가</button><button className="soft-button" disabled={timeline.busy || timeline.items.length < 2} onClick={() => setOrdering([...timeline.items])}><ListOrdered size={15} /> 순서변경</button></div>}
    <section className="timeline-frame is-overview" aria-busy={!timeline.ready && !timeline.status} aria-label="TIMELINE">

      {!timeline.items.length ? <p className="empty-state" role="status">{timeline.ready ? '아직 기록한 사건이 없어요.' : timeline.status ? '' : '타임라인을 불러오는 중…'}</p> : <div className="timeline-overview" inert={detailOpen} ref={overview} tabIndex={0} role="region" aria-label="전체 사건"><div className="timeline-overview-canvas" style={{ width: `max(100%, ${timeline.items.length * 215}px)` }}>
        <div className="timeline-years">{yearGroups.map(group => <div key={group.id} style={{ flex: group.count }}><span>{group.year}</span></div>)}</div>
        <ol className="timeline-overview-track">
          {timeline.items.map((item, index) => <li key={item.id} className={`${index % 2 ? 'below' : 'above'} ${item.highlighted ? 'is-highlighted' : ''}`}><button data-overview-id={item.id} onClick={() => open(item.id)} aria-label={`${item.year}년 ${item.dateLabel || `${item.month}월`} · ${item.title}${item.highlighted ? ' · 중요 사건' : ''}${item.subtitle ? ` · ${item.subtitle}` : ''} · 자세히 보기`}><span className="overview-point" aria-hidden="true" /><span className="overview-branch" aria-hidden="true" /><span className="overview-event"><span className="overview-event-content"><span className="overview-date">{item.dateLabel || `${item.month}월${item.day ? ` ${item.day}일` : ''}`}</span><strong>{item.title}</strong><span className="overview-excerpt">{timelineBodyBlocks(item.body).filter(block => !block.subtitle).map(block => block.text).join(' ')}</span><span className="overview-open" aria-hidden="true">이야기 펼치기 <ArrowRight size={13} /></span></span>{item.subtitle && <span className="timeline-event-subtitle">{item.subtitle}</span>}</span></button></li>)}
        </ol>
      </div></div>}
      {detailOpen && <div className="timeline-detail-overlay" ref={backdrop} role="region" aria-label="사건 자세히 보기" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); void close() } }} onClick={event => { if (event.target === event.currentTarget) void close() }}>
        <div className="timeline-detail-surface" ref={surface} onClick={event => { if (event.target === event.currentTarget) void close() }}>
        <button className="icon-button timeline-detail-close" aria-label="상세 닫기" onClick={() => void close()}><X size={16} /></button>
        <button className="timeline-side-arrow previous" aria-label="이전 사건" disabled={timeline.items[0]?.id === activeId} onClick={() => step(-1)}><ChevronLeft size={28} /></button>
        <div className="timeline-scroll" ref={panel} tabIndex={0} role="region" aria-label="사건 상세 · 스크롤 또는 방향키로 이동" onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); step(event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) } }}>
          {timeline.items.map((item, index) => <article key={item.id} data-event-id={item.id} aria-labelledby={`event-${item.id}`} className={`timeline-entry ${activeId === item.id ? 'is-active' : ''}`} inert={activeId !== item.id}>
            <div className={`timeline-card ${item.highlighted ? 'is-highlighted' : ''}`}><div className="timeline-detail-header"><span className="timeline-chapter">CHAPTER {String(index + 1).padStart(2, '0')}</span><div className="timeline-date"><strong>{item.year}</strong><span><CalendarDays size={12} /> {item.dateLabel || `${item.month}월${item.day ? ` ${item.day}일` : ''}`}</span></div><h2 id={`event-${item.id}`}>{item.title}</h2>{item.highlighted && <span className="timeline-important-label">중요 사건</span>}{item.subtitle && <p className="timeline-event-subtitle">{item.subtitle}</p>}</div><div className="timeline-story" tabIndex={0} role="region" aria-label={`${item.title} 본문`}><div className="timeline-body">{timelineBodyBlocks(item.body).map((block, i) => block.subtitle ? <h3 key={i}>{block.text}</h3> : <p key={i}>{block.text}</p>)}</div>{admin && <button className="soft-button" disabled={!timeline.ready || timeline.busy} onClick={() => edit(item)}>사건 편집</button>}</div></div>
          </article>)}
        </div>
        <button className="timeline-side-arrow next" aria-label="다음 사건" disabled={timeline.items.at(-1)?.id === activeId} onClick={() => step(1)}><ChevronRight size={28} /></button>
        </div>
      </div>}
    </section>
    {ordering && admin && <TimelineOrderDialog items={ordering} busy={timeline.busy} status={timeline.status} save={timeline.reorder} close={() => setOrdering(null)} />}
    <dialog ref={dialog} className="archive-editor" aria-label="타임라인 작성·편집" onCancel={event => { if (timeline.busy) event.preventDefault() }} onClose={() => setDraft(null)}>
      {draft && admin && <form onSubmit={event => { event.preventDefault(); void save() }}><div className="archive-editor-heading"><h2>{draft.revision || timeline.items.some(item => item.id === draft.id) ? '사건 편집' : '새로운 사건'}</h2><button className="icon-button" aria-label="편집 닫기" type="button" disabled={timeline.busy} onClick={() => dialog.current?.close()}><X size={18} /></button></div>
        <p>저장하면 모든 방문자에게 공개됩니다. 여러 달에 걸친 사건도 하나로 작성하세요. 기본 정렬에는 시작 날짜를 사용합니다. 순서변경에서 자유롭게 배치할 수 있고, 순서를 지정한 뒤 새 사건은 마지막에 추가됩니다. 초입·중순·일주일 뒤 같은 표현과 기간은 날짜 표시 문구에 적으세요. 날짜를 모르면 일은 비워 두세요.</p>
        <fieldset disabled={timeline.busy}><label>사건 제목<input required maxLength={120} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
          <div className="archive-date-fields"><label>연도<input type="number" min={1} max={9999} required value={draft.year || ''} onChange={event => setDraft({ ...draft, year: Number(event.target.value) })} /></label><label>월<input type="number" min={1} max={12} required value={draft.month || ''} onChange={event => setDraft({ ...draft, month: Number(event.target.value) })} /></label><label>일 (선택)<input type="number" min={1} max={31} value={draft.day || ''} onChange={event => setDraft({ ...draft, day: Number(event.target.value) })} /></label></div>
          <label>날짜·기간 표시 문구 (선택)<input maxLength={80} placeholder="예: 9–10월, 2049년 12월–2050년 2월" value={draft.dateLabel} onChange={event => setDraft({ ...draft, dateLabel: event.target.value })} /></label>
          <label className="timeline-highlight-field"><input type="checkbox" checked={draft.highlighted ?? false} onChange={event => setDraft({ ...draft, highlighted: event.target.checked })} />중요 사건 강조</label>
          <label>짧은 부제목 (선택)<input maxLength={40} placeholder="예: 첫만남, 고백" value={draft.subtitle ?? ''} onChange={event => setDraft({ ...draft, subtitle: event.target.value })} /></label>
          <label>이야기 · 부제는 줄 앞에 ## 입력<textarea rows={10} required maxLength={12000} placeholder={'## 9월\n\n이야기\n\n## 10월\n\n이야기'} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} /></label>
          <details className="archive-preview"><summary>내용 미리보기</summary><span>{draft.year} · {draft.dateLabel || `${draft.month}월`}</span><h3>{draft.title || '사건 제목'}</h3>{draft.highlighted && <span className="timeline-important-label">중요 사건</span>}{draft.subtitle && <p className="timeline-event-subtitle">{draft.subtitle}</p>}<div className="timeline-body">{timelineBodyBlocks(draft.body).map((block, i) => block.subtitle ? <h3 key={i}>{block.text}</h3> : <p key={i}>{block.text}</p>)}</div></details>
          <div className="archive-editor-actions"><button className="primary-button" type="submit">공개 저장</button><button className="soft-button" type="button" onClick={() => dialog.current?.close()}>취소</button>{timeline.items.some(item => item.id === draft.id) && <button className="soft-button" type="button" onClick={() => setRemove(!remove)}>사건 삭제</button>}</div>
          {remove && <div className="archive-delete-confirm"><p>이 사건을 타임라인에서 삭제할까요?</p><button className="soft-button" type="button" onClick={() => void save(true)}>삭제 확인</button></div>}
        </fieldset><p role="alert">{error}</p><p role="status">{timeline.status}</p>
      </form>}
    </dialog>
  </>
}
