export function coveringRadius(x: number, y: number, width: number, height: number) {
  // The smallest edge multiplier below is .84; reserve enough radius to cover every corner.
  return Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) / .8
}

export function liquidPath(x: number, y: number, radius: number, progress: number) {
  const points = 160
  let path = ''
  for (let i = 0; i <= points; i++) {
    const angle = i / points * Math.PI * 2
    const edge = 1 + .085 * Math.sin(angle * 5 + progress * 9)
      + .045 * Math.sin(angle * 8 - progress * 13)
      + .03 * Math.cos(angle * 3 + progress * 6)
    const px = x + Math.cos(angle) * radius * edge
    const py = y + Math.sin(angle) * radius * edge
    path += `${i ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)} `
  }
  return `${path}Z`
}
