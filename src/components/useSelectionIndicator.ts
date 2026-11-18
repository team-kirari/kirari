import { useLayoutEffect, useRef } from 'react'

/** Keep one selection surface mounted while its buttons and layout change. */
export function useSelectionIndicator<T extends HTMLElement>(selection: string) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const container = ref.current
    if (!container) return
    const update = () => {
      const active = container.querySelector<HTMLElement>('[aria-current="page"], [aria-pressed="true"]')
      if (!active || !active.offsetWidth) {
        container.style.setProperty('--selection-opacity', '0')
        return
      }
      container.style.setProperty('--selection-x', `${active.offsetLeft}px`)
      container.style.setProperty('--selection-y', `${active.offsetTop}px`)
      container.style.setProperty('--selection-width', `${active.offsetWidth}px`)
      container.style.setProperty('--selection-height', `${active.offsetHeight}px`)
      container.style.setProperty('--selection-opacity', '1')
      // Flush the first position before enabling movement from future selections.
      if (!container.hasAttribute('data-selection-ready')) {
        container.getBoundingClientRect()
        container.setAttribute('data-selection-ready', '')
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    for (const button of container.querySelectorAll('button')) observer.observe(button)
    window.addEventListener('resize', update)
    return () => { observer.disconnect(); window.removeEventListener('resize', update) }
  }, [selection])
  return ref
}
