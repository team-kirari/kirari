import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { coveringRadius, createLiquidMotion, liquidPath } from '../lib/liquid'

export type LiquidHandle = {
  play: (x: number, y: number, color: string, covered: () => void, ready?: Promise<void>) => void
}

export const LiquidTransition = forwardRef<LiquidHandle>(function LiquidTransition(_, ref) {
  const svg = useRef<SVGSVGElement>(null)
  const path = useRef<SVGPathElement>(null)
  const frame = useRef(0)
  const busy = useRef(false)
  const pending = useRef<Parameters<LiquidHandle['play']> | null>(null)

  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  useImperativeHandle(ref, () => {
    const play: LiquidHandle['play'] = (x, y, color, covered, ready) => {
      if (busy.current) { pending.current = [x, y, color, covered, ready]; return }
      if (!svg.current || !path.current) { covered(); return }
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        covered()
        return
      }
      busy.current = true
      const overlay = svg.current
      const shape = path.current
      const width = window.innerWidth
      const height = window.innerHeight
      const motion = createLiquidMotion()
      overlay.setAttribute('viewBox', `0 0 ${width} ${height}`)
      shape.setAttribute('fill', color)
      shape.setAttribute('d', liquidPath(x, y, 0, 0, motion))
      overlay.style.visibility = 'visible'
      overlay.style.opacity = '1'
      overlay.style.pointerEvents = 'all'
      overlay.setAttribute('data-active', 'true')
      const maxRadius = coveringRadius(x, y, width, height)
      const started = performance.now()
      let prepared = !ready
      void ready?.then(() => { prepared = true }, () => { prepared = true })
      let swapped = false
      let revealStarted = 0
      function tick(now: number) {
        const elapsed = now - started
        const p = Math.min(1, elapsed / 1150)
        const eased = p * p * (3 - 2 * p)
        shape.setAttribute('d', liquidPath(x, y, 4 + maxRadius * eased, p, motion))
        // Keep the liquid opaque while the staged destination prepares.
        // Promotion resumes its paused animations on the first reveal frame.
        if (elapsed >= 1210 && prepared && !swapped) {
          covered()
          swapped = true
          revealStarted = now
        }
        const revealElapsed = swapped ? now - revealStarted : 0
        if (swapped) overlay.style.opacity = String(Math.max(0, 1 - revealElapsed / 330))
        if (!swapped || revealElapsed < 330) frame.current = requestAnimationFrame(tick)
        else {
          overlay.style.visibility = 'hidden'
          overlay.style.pointerEvents = 'none'
          overlay.removeAttribute('data-active')
          busy.current = false
          const queued = pending.current
          pending.current = null
          if (queued) play(...queued)
        }
      }
      frame.current = requestAnimationFrame(tick)
    }
    return { play }
  })

  return <svg ref={svg} className="liquid-transition" aria-hidden="true"><path ref={path} /></svg>
})
