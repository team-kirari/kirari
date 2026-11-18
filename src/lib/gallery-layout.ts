/** Place each next photo in the shortest column, breaking ties left to right. */
export function masonryPositions(heights: readonly number[], columns: number, width: number, gap: number, rowGap: number) {
  const bottoms = Array<number>(columns).fill(0)
  const positions = heights.map(height => {
    const column = bottoms.indexOf(Math.min(...bottoms))
    const position = { left: column * (width + gap), top: bottoms[column] }
    bottoms[column] += height + rowGap
    return position
  })
  return { positions, height: heights.length ? Math.max(...bottoms) - rowGap : 0 }
}

export function layoutGallery(root: HTMLElement) {
  if (!root.clientWidth) return
  const styles = getComputedStyle(root)
  const columns = Number(styles.getPropertyValue('--gallery-columns')) || 1
  const gap = parseFloat(styles.columnGap) || 0
  const rowGap = parseFloat(styles.rowGap) || 0
  const width = (root.clientWidth - gap * (columns - 1)) / columns
  const cards = [...root.querySelectorAll<HTMLElement>('.gallery-item:not([hidden])')]
  root.dataset.masonryReady = 'true'
  cards.forEach(card => { card.style.width = `${width}px` })
  const { positions, height } = masonryPositions(cards.map(card => card.offsetHeight), columns, width, gap, rowGap)
  cards.forEach((card, index) => {
    card.style.left = `${positions[index].left}px`
    card.style.top = `${positions[index].top}px`
  })
  root.style.height = `${height}px`
}
