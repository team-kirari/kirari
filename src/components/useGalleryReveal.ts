import { useEffect, useLayoutEffect, useRef } from 'react'
import { observeGallery } from '../lib/gallery-reveal'
import { layoutGallery } from '../lib/gallery-layout'

/** Keep loaded images mounted across filters; request new ones near the viewport. */
export function useGalleryReveal(sources: string, filter: string) {
  const grid = useRef<HTMLDivElement>(null)
  const positions = useRef(new Map<HTMLElement, { left: number, top: number }>())
  const animations = useRef<Animation[]>([])
  function measure() {
    const next = new Map<HTMLElement, { left: number, top: number }>()
    grid.current?.querySelectorAll<HTMLElement>('.gallery-item:not([hidden])').forEach(card => {
      next.set(card, { left: card.offsetLeft, top: card.offsetTop })
    })
    return next
  }
  useLayoutEffect(() => {
    animations.current.forEach(animation => animation.cancel())
    animations.current = []
    if (grid.current) layoutGallery(grid.current)
    const next = measure()
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    next.forEach((rect, card) => {
      const previous = positions.current.get(card)
      if (!reduceMotion && previous && card.dataset.visible && card.dataset.loaded) {
        const x = previous.left - rect.left
        const y = previous.top - rect.top
        if (x || y) animations.current.push(card.animate([{ translate: `${x}px ${y}px` }, { translate: '0px 0px' }], {
          duration: 380, easing: 'cubic-bezier(.22,1,.36,1)',
        }))
      }
    })
    positions.current = next
  }, [sources, filter])
  useEffect(() => {
    const root = grid.current
    if (!root) return
    const stop = observeGallery(root)
    // Image decoding changes masonry heights; keep the next filter's starting positions current.
    function updateLayout() {
      layoutGallery(root!)
      positions.current = measure()
    }
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateLayout)
    resize?.observe(root)
    root.querySelectorAll<HTMLElement>('.gallery-item').forEach(card => resize?.observe(card))
    root.addEventListener('load', updateLayout, true)
    root.addEventListener('error', updateLayout, true)
    window.addEventListener('resize', updateLayout)
    return () => {
      stop(); resize?.disconnect(); animations.current.forEach(animation => animation.cancel())
      root.removeEventListener('load', updateLayout, true)
      root.removeEventListener('error', updateLayout, true)
      window.removeEventListener('resize', updateLayout)
    }
  }, [sources])
  return grid
}
