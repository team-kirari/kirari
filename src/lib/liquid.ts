export function createLiquidMotion(random: () => number = Math.random) {
  const between = (min: number, max: number) => min + random() * (max - min)
  const direction = random() < .5 ? -1 : 1
  return {
    flowPhase: between(0, Math.PI * 2),
    flowStrength: between(.16, .32),
    flowSpeed: between(.6, 1.1) * direction,
    waves: [
      { lobes: 3 + Math.floor(random() * 2), amplitude: between(.15, .19), speed: between(.9, 1.6) * direction, phase: between(0, Math.PI * 2) },
      { lobes: 5 + Math.floor(random() * 3), amplitude: between(.065, .095), speed: between(1.2, 2) * -direction, phase: between(0, Math.PI * 2) },
      { lobes: 2, amplitude: between(.025, .045), speed: between(.4, .9) * direction, phase: between(0, Math.PI * 2) },
    ],
  }
}

// Keep pure geometry calls repeatable; playback supplies one fresh motion per navigation.
const defaultMotion = createLiquidMotion(() => .5)

export function coveringRadius(x: number, y: number, width: number, height: number) {
  // The waves below keep the edge at least .67 of the radius, even as they flow.
  return Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) / .65
}

export function liquidPath(x: number, y: number, radius: number, progress: number, motion = defaultMotion) {
  const count = 64
  const time = progress * Math.PI * 2
  const points = Array.from({ length: count }, (_, i) => {
    const angle = i / count * Math.PI * 2
    // Advect the waves around the edge: lobes stretch, merge and trade places
    // instead of keeping one silhouette while the whole shape scales up.
    const flow = angle + motion.flowStrength * Math.sin(angle * 2 - time * motion.flowSpeed + motion.flowPhase)
    const edge = 1 + motion.waves.reduce((sum, wave) =>
      sum + wave.amplitude * Math.sin(flow * wave.lobes - time * wave.speed + wave.phase), 0)
    return [x + Math.cos(angle) * radius * edge, y + Math.sin(angle) * radius * edge]
  })
  const format = (point: number[]) => `${point[0].toFixed(2)},${point[1].toFixed(2)}`
  let path = `M${format(points[0])} `
  // A closed Catmull–Rom curve gives the liquid a smooth, continuous surface.
  for (let i = 0; i < count; i++) {
    const previous = points[(i + count - 1) % count]
    const current = points[i]
    const next = points[(i + 1) % count]
    const after = points[(i + 2) % count]
    const start = current.map((value, axis) => value + (next[axis] - previous[axis]) / 6)
    const end = next.map((value, axis) => value - (after[axis] - current[axis]) / 6)
    path += `C${format(start)} ${format(end)} ${format(next)} `
  }
  return `${path}Z`
}
