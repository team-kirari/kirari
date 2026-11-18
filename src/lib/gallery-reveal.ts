/** Observe existing cards so filtering never replaces an image or its loaded source. */
export function observeGallery(root: HTMLElement): () => void {
  const cards = root.querySelectorAll<HTMLElement>('.gallery-item')
  function enter(card: HTMLElement) {
    const image = card.querySelector<HTMLImageElement>('img')
    if (image?.dataset.src && !image.hasAttribute('src')) image.src = image.dataset.src
    card.dataset.visible = 'true'
  }
  if (!('IntersectionObserver' in window)) {
    cards.forEach(enter)
    return () => {}
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const card = entry.target as HTMLElement
      if (entry.isIntersecting) enter(card)
      else delete card.dataset.visible
    }
  }, { rootMargin: '80px 0px', threshold: 0 })
  cards.forEach(card => observer.observe(card))
  return () => observer.disconnect()
}
