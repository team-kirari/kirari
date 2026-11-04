import { useLayoutEffect, useRef } from 'react'
import type { Dispatch, DragEvent, KeyboardEvent, MouseEvent, PointerEvent, SetStateAction } from 'react'
import { clampWidgetOffset } from '../lib/drag'
import type { WidgetOffset } from '../lib/drag'

export type WidgetPositions = Record<string, WidgetOffset>
type ActiveDrag = { id: string, element: HTMLElement, origin: WidgetOffset, moved: boolean, pointerId: number, base: WidgetOffset, grab: WidgetOffset, offset: WidgetOffset, start: WidgetOffset }

function applyStackOrder(container: HTMLElement, order: string[]) {
  for (const element of container.querySelectorAll<HTMLElement>('[data-widget-id]')) {
    const index = order.indexOf(element.dataset.widgetId!)
    if (index < 0) element.style.removeProperty('--widget-z')
    else element.style.setProperty('--widget-z', String(16 + index))
  }
}

function moveToFront(positions: WidgetPositions, id: string, offset: WidgetOffset): WidgetPositions {
  const next = { ...positions }
  delete next[id]
  return { ...next, [id]: offset }
}

export function useWidgetDrag(positions: WidgetPositions, setPositions: Dispatch<SetStateAction<WidgetPositions>>, layoutKey = '', enabled = false) {
  const scene = useRef<HTMLDivElement>(null)
  const active = useRef<ActiveDrag | null>(null)
  const suppressClick = useRef(false)
  const isMobile = () => window.matchMedia('(max-width: 700px)').matches

  function apply(element: HTMLElement, offset: WidgetOffset) {
    element.style.setProperty('--drag-x', `${offset.x}px`)
    element.style.setProperty('--drag-y', `${offset.y}px`)
  }

  useLayoutEffect(() => {
    const container = scene.current
    if (!container) return
    function restoreAndClamp() {
      if (active.current) return
      // The most recently moved widget is last and receives the highest layer.
      applyStackOrder(container!, Object.keys(positions))
      const mobile = isMobile()
      for (const element of container!.querySelectorAll<HTMLElement>('[data-widget-id]')) {
        element.tabIndex = mobile || !enabled ? -1 : 0
        if (mobile) {
          apply(element, { x: 0, y: 0 })
          element.removeAttribute('data-moved')
          element.removeAttribute('title')
        } else if (enabled) element.title = '드래그하여 이동 · 방향키로 조절 · Shift로 크게 이동'
        else element.removeAttribute('title')
      }
      if (mobile) return
      const bounds = container!.getBoundingClientRect()
      const updates: WidgetPositions = {}
      for (const element of container!.querySelectorAll<HTMLElement>('[data-widget-id]')) {
        const id = element.dataset.widgetId!
        const offset = positions[id] || { x: 0, y: 0 }
        apply(element, offset)
        if (!positions[id]) { element.removeAttribute('data-moved'); continue }
        const rect = element.getBoundingClientRect()
        const base = { x: rect.left - bounds.left - offset.x, y: rect.top - bounds.top - offset.y }
        const clamped = clampWidgetOffset(offset, base, rect, bounds)
        apply(element, clamped)
        element.dataset.moved = 'true'
        if (clamped.x !== offset.x || clamped.y !== offset.y) updates[id] = clamped
      }
      if (enabled && Object.keys(updates).length) setPositions(previous => ({ ...previous, ...updates }))
    }
    restoreAndClamp()
    const observer = new ResizeObserver(restoreAndClamp)
    observer.observe(container)
    for (const element of container.querySelectorAll<HTMLElement>('[data-widget-id]')) observer.observe(element)
    window.addEventListener('resize', restoreAndClamp)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', restoreAndClamp)
    }
  }, [positions, setPositions, layoutKey, enabled])

  function finish(cancelled = false) {
    const drag = active.current
    if (!drag) return
    active.current = null
    delete drag.element.dataset.dragging
    if (!drag.moved) return
    suppressClick.current = true
    const offset = cancelled ? drag.start : drag.offset
    apply(drag.element, offset)
    if (drag.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId)
    setPositions(previous => moveToFront(previous, drag.id, offset))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled || isMobile()) return
    const target = event.target as HTMLElement
    const element = target.closest<HTMLElement>('[data-widget-id]')
    if (!element || target.closest('input, textarea, select, [contenteditable=true], [data-no-drag]') || !scene.current || event.button !== 0 || active.current) return
    const scrollArea = target.closest<HTMLElement>('[data-widget-scroll]')
    if (scrollArea) {
      // Mouse drags move the widget; touch/pen gestures and scrollbar drags scroll.
      const scrollBounds = scrollArea.getBoundingClientRect()
      if (event.pointerType !== 'mouse'
        || event.clientX < scrollBounds.left + scrollArea.clientLeft
        || event.clientX >= scrollBounds.left + scrollArea.clientLeft + scrollArea.clientWidth) return
    }
    suppressClick.current = false
    const bounds = scene.current.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    const id = element.dataset.widgetId!
    const offset = positions[id] || { x: 0, y: 0 }
    active.current = {
      id, element, origin: { x: event.clientX, y: event.clientY }, moved: false, pointerId: event.pointerId, offset, start: offset,
      base: { x: rect.left - bounds.left - offset.x, y: rect.top - bounds.top - offset.y },
      grab: { x: event.clientX - rect.left, y: event.clientY - rect.top },
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = active.current
    if (!drag || event.pointerId !== drag.pointerId || !scene.current) return
    if (!enabled) { finish(true); return }
    if (isMobile()) { finish(true); return }
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.origin.x, event.clientY - drag.origin.y) < 6) return
      drag.moved = true
      const order = [...Object.keys(positions).filter(id => id !== drag.id), drag.id]
      applyStackOrder(scene.current, order)
      drag.element.dataset.dragging = 'true'
      drag.element.dataset.moved = 'true'
      drag.element.focus({ preventScroll: true })
      drag.element.setPointerCapture(event.pointerId)
    }
    event.preventDefault()
    const bounds = scene.current.getBoundingClientRect()
    const rect = drag.element.getBoundingClientRect()
    drag.offset = clampWidgetOffset({ x: event.clientX - bounds.left - drag.grab.x - drag.base.x, y: event.clientY - bounds.top - drag.grab.y - drag.base.y }, drag.base, rect, bounds)
    apply(drag.element, drag.offset)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && active.current) { event.preventDefault(); finish(true); return }
    if (!enabled || isMobile()) return
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-widget-id]')
    if (event.target !== element) return
    const directions: Record<string, WidgetOffset> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }
    const direction = directions[event.key]
    if (!element || !direction || !scene.current || active.current) return
    event.preventDefault()
    const id = element.dataset.widgetId!
    const offset = positions[id] || { x: 0, y: 0 }
    const rect = element.getBoundingClientRect()
    const bounds = scene.current.getBoundingClientRect()
    const base = { x: rect.left - bounds.left - offset.x, y: rect.top - bounds.top - offset.y }
    const step = event.shiftKey ? 30 : 10
    const next = clampWidgetOffset({ x: offset.x + direction.x * step, y: offset.y + direction.y * step }, base, rect, bounds)
    setPositions(previous => moveToFront(previous, id, next))
  }

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current || event.detail === 0) return
    suppressClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return { ref: scene, onClickCapture, onDragStart: (event: DragEvent<HTMLDivElement>) => { if (!isMobile()) event.preventDefault() }, onPointerDown, onPointerMove, onPointerLeave: () => { if (active.current && !active.current.moved) finish(true) }, onPointerUp: (e: PointerEvent<HTMLDivElement>) => { if (e.pointerId === active.current?.pointerId) finish() }, onPointerCancel: () => finish(true), onLostPointerCapture: () => finish(), onKeyDown }
}
