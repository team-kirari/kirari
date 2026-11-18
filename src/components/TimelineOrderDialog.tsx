import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react'
import { moveTimelineEvent, timelineInsertionIndex } from '../lib/timeline'
import type { TimelineEvent } from '../lib/timeline'

type Drag = { item: TimelineEvent; pointerId: number; x: number; y: number; offsetX: number; offsetY: number; width: number; height: number; slot: number }

export function TimelineOrderDialog({ items, busy, status, save, close }: {
  items: TimelineEvent[]; busy: boolean; status: string
  save: (items: TimelineEvent[]) => Promise<boolean>; close: () => void
}) {
  const [ordered, setOrdered] = useState(() => [...items])
  const [drag, setDrag] = useState<Drag | null>(null)
  const activeDrag = useRef<Drag | null>(null)
  const frame = useRef(0)
  const previousFrame = useRef(0)
  const [announcement, setAnnouncement] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const list = useRef<HTMLOListElement>(null)
  useLayoutEffect(() => {
    dialog.current?.showModal()
    return () => cancelAnimationFrame(frame.current)
  }, [])
  function move(id: string, target: string) {
    setOrdered(current => moveTimelineEvent(current, id, target))
  }
  function updateDrag(scroll = 0) {
    const current = activeDrag.current, root = list.current, panel = dialog.current
    if (!current || !root || !panel) return
    const bounds = root.getBoundingClientRect(), panelBounds = panel.getBoundingClientRect()
    // Capture belongs to the stable panel, so crossing rows or buttons cannot end a drag.
    const inside = current.x >= panelBounds.left && current.x <= panelBounds.right && current.y >= panelBounds.top && current.y <= panelBounds.bottom
    if (inside) {
      const edge = 48
      const speed = current.y < bounds.top + edge ? -Math.min(1, (bounds.top + edge - current.y) / edge)
        : current.y > bounds.bottom - edge ? Math.min(1, (current.y - bounds.bottom + edge) / edge) : 0
      root.scrollTop += speed * scroll
      const rows = [...root.querySelectorAll<HTMLElement>('[data-order-id]')].filter(row => row.dataset.orderId !== current.item.id)
      const slot = timelineInsertionIndex(rows.map(row => { const box = row.getBoundingClientRect(); return { top: box.top, height: box.height } }), current.y)
      const next = { ...current, slot }
      activeDrag.current = next; setDrag(next)
    }
  }
  function finishDrag(commit: boolean) {
    const current = activeDrag.current
    if (!current) return
    activeDrag.current = null; cancelAnimationFrame(frame.current); setDrag(null)
    if (dialog.current?.hasPointerCapture(current.pointerId)) dialog.current.releasePointerCapture(current.pointerId)
    if (commit) {
      setOrdered(entries => moveTimelineEvent(entries, current.item.id, entries[current.slot].id))
      setAnnouncement(`${current.item.title}, ${current.slot + 1}번째로 이동`)
    } else setAnnouncement('드래그를 취소했습니다.')
  }
  function startDrag(event: React.PointerEvent<HTMLButtonElement>, item: TimelineEvent, index: number) {
    if (event.button !== 0 || !event.isPrimary || busy || activeDrag.current) return
    const row = event.currentTarget.closest('li')
    if (!row || !dialog.current) return
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true })
    const box = row.getBoundingClientRect()
    const next = { item, pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: event.clientX - box.left, offsetY: event.clientY - box.top, width: box.width, height: box.height, slot: index }
    activeDrag.current = next; setDrag(next)
    dialog.current.setPointerCapture(event.pointerId)
    previousFrame.current = event.timeStamp
    const tick = (time: number) => {
      if (!activeDrag.current) return
      const delta = Math.min(32, time - previousFrame.current)
      previousFrame.current = time
      updateDrag(delta * .7)
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }
  const remaining = drag ? ordered.filter(item => item.id !== drag.item.id) : []
  const beforeId = drag ? remaining[drag.slot]?.id : undefined
  const afterId = drag && drag.slot === remaining.length ? remaining.at(-1)?.id : undefined
  const changed = ordered.some((item, index) => item.id !== items[index]?.id)
  return <dialog ref={dialog} className={`archive-editor timeline-order-dialog${drag ? ' is-sorting' : ''}`} aria-labelledby="timeline-order-heading"
    onPointerMove={event => {
      const current = activeDrag.current
      if (current?.pointerId !== event.pointerId) return
      activeDrag.current = { ...current, x: event.clientX, y: event.clientY }; updateDrag()
    }}
    onPointerUp={event => { if (activeDrag.current?.pointerId === event.pointerId) finishDrag(true) }}
    onPointerCancel={event => { if (activeDrag.current?.pointerId === event.pointerId) finishDrag(false) }}
    onLostPointerCapture={event => { if (activeDrag.current?.pointerId === event.pointerId) finishDrag(false) }}
    onCancel={event => { if (activeDrag.current) { event.preventDefault(); finishDrag(false) } else if (busy) event.preventDefault() }} onClose={close}>
    <form onSubmit={event => { event.preventDefault(); if (changed && !activeDrag.current) void save(ordered).then(saved => { if (saved) dialog.current?.close() }) }}>
      <div className="archive-editor-heading"><h2 id="timeline-order-heading">사건 순서변경</h2><button type="button" className="icon-button" aria-label="순서변경 닫기" disabled={busy || !!drag} onClick={() => dialog.current?.close()}><X size={18} /></button></div>
      <p>손잡이를 드래그해 표시선 위치에 놓거나 위·아래 버튼으로 순서를 바꾸세요. 저장하면 전체 타임라인과 상세 보기에 함께 적용됩니다. 취소하면 변경하지 않습니다.</p>
      <ol ref={list} className="timeline-order-list" aria-label="사건 표시 순서">
        {ordered.map((item, index) => <li key={item.id} data-order-id={item.id} className={[drag?.item.id === item.id ? 'is-drag-source' : '', beforeId === item.id ? 'insert-before' : '', afterId === item.id ? 'insert-after' : ''].join(' ')}>
          <button type="button" className="icon-button timeline-order-handle" disabled={busy} aria-label={`${item.title} 순서 이동: 위아래 방향키 또는 드래그`} onKeyDown={event => {
            if (activeDrag.current || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
            event.preventDefault()
            const target = ordered[index + (event.key === 'ArrowUp' ? -1 : 1)]
            if (target) { move(item.id, target.id); setAnnouncement(`${item.title}, ${event.key === 'ArrowUp' ? index : index + 2}번째로 이동`) }
          }} onPointerDown={event => startDrag(event, item, index)}><GripVertical size={18} /></button>
          <span className="timeline-order-number">{index + 1}</span><div className="timeline-order-label"><small>{item.year}년 · {item.dateLabel || `${item.month}월${item.day ? ` ${item.day}일` : ''}`}</small><strong>{item.title}</strong></div>
          <button type="button" className="icon-button" aria-label={`${item.title} 위로 이동`} disabled={busy || !!drag || index === 0} onClick={() => { move(item.id, ordered[index - 1].id); setAnnouncement(`${item.title}, ${index}번째로 이동`) }}><ArrowUp size={16} /></button>
          <button type="button" className="icon-button" aria-label={`${item.title} 아래로 이동`} disabled={busy || !!drag || index === ordered.length - 1} onClick={() => { move(item.id, ordered[index + 1].id); setAnnouncement(`${item.title}, ${index + 2}번째로 이동`) }}><ArrowDown size={16} /></button>
        </li>)}
      </ol>
      {drag && <div className="timeline-order-ghost" aria-hidden="true" style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width, minHeight: drag.height }}><GripVertical size={20} /><div className="timeline-order-label"><small>{drag.slot + 1}번째 위치에 놓기</small><strong>{drag.item.title}</strong></div></div>}
      <p role="status" aria-live="polite">{announcement}</p>
      <div className="archive-editor-actions"><button className="primary-button" type="submit" disabled={busy || !!drag || !changed}>순서 저장</button><button className="soft-button" type="button" disabled={busy || !!drag} onClick={() => dialog.current?.close()}>취소</button></div>
      <p role="status">{status}</p>
    </form>
  </dialog>
}
