/** Warm the actual destination instance, including randomly selected images.
 * Only the first viewport is eager; the rest of a large gallery stays lazy.
 * Errors and the deadline release the transition to the screen's own UI.
 */
export function preparePage(root: HTMLElement, signal: AbortSignal, timeout = 4000): Promise<void> {
  return new Promise(resolve => {
    let finished = false
    let pending = 1
    const images = new Map<HTMLImageElement, string>()
    const observer = new MutationObserver(check)
    const timer = window.setTimeout(finish, timeout)
    function finish() {
      if (finished) return
      finished = true
      window.clearTimeout(timer)
      observer.disconnect()
      signal.removeEventListener('abort', finish)
      resolve()
    }
    function check() {
      if (finished) return
      const top = root.getBoundingClientRect().top
      const visibleImages = [...root.querySelectorAll<HTMLImageElement>('img')].filter(image =>
        image.loading !== 'lazy' || image.getBoundingClientRect().top - top < window.innerHeight + 120
      ).slice(0, 12)
      for (const image of visibleImages) {
        const source = image.currentSrc || image.src
        if (!source || images.get(image) === source) continue
        images.set(image, source)
        image.loading = 'eager'
        pending++
        void image.decode().catch(() => {}).finally(() => { pending--; check() })
      }
      if (!pending && !root.querySelector('[aria-busy="true"], [data-page-loading="true"]')) finish()
    }
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'aria-busy', 'data-page-loading'] })
    signal.addEventListener('abort', finish, { once: true })
    if (signal.aborted) { finish(); return }
    // These are the shared UI faces; story reader fonts load when selected.
    void Promise.allSettled([
      document.fonts.load('16px "Kirari Paperlogy"', '기록'),
      document.fonts.load('600 16px "Kirari Paperlogy"', '기록'),
    ]).finally(() => { pending--; check() })
    check()
  })
}
