import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { coveringRadius, liquidPath } from '../lib/liquid'

export type LiquidHandle = {
  play: (x: number, y: number, color: string, covered: () => void) => void
}

export const LiquidTransition = forwardRef<LiquidHandle>(function LiquidTransition(_, ref) {
  const svg = useRef<SVGSVGElement>(null)
  const path = useRef<SVGPathElement>(null)
  const frame = useRef(0)
  const busy = useRef(false)

  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  useImperativeHandle(ref, () => ({
    play(x, y, color, covered) {
      if (busy.current || !svg.current || !path.current) return
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        covered()
        return
      }
      busy.current = true
      const overlay = svg.current
      const shape = path.current
      const width = window.innerWidth
      const height = window.innerHeight
      overlay.setAttribute('viewBox', `0 0 ${width} ${height}`)
      shape.setAttribute('fill', color)
      shape.setAttribute('d', liquidPath(x, y, 0, 0))
      overlay.style.visibility = 'visible'
      overlay.style.opacity = '1'
      overlay.style.pointerEvents = 'all'
      overlay.setAttribute('data-active', 'true')
      const maxRadius = coveringRadius(x, y, width, height)
      const started = performance.now()
      let swapped = false
      function tick(now: number) {
        const elapsed = now - started
        const p = Math.min(1, elapsed / 820)
        const eased = 1 - Math.pow(1 - p, 3)
        shape.setAttribute('d', liquidPath(x, y, 4 + maxRadius * eased, p))
        if (p === 1 && !swapped) {
          covered()
          swapped = true
        }
        if (elapsed > 880) overlay.style.opacity = String(Math.max(0, 1 - (elapsed - 880) / 330))
        if (elapsed < 1210) frame.current = requestAnimationFrame(tick)
        else {
          overlay.style.visibility = 'hidden'
          overlay.style.pointerEvents = 'none'
          overlay.removeAttribute('data-active')
          busy.current = false
        }
      }
      frame.current = requestAnimationFrame(tick)
    },
  }))

  return <svg ref={svg} className="liquid-transition" aria-hidden="true"><path ref={path} /></svg>
})
