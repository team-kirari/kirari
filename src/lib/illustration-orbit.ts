export function illustrationOrbitFrames(incoming: boolean): Keyframe[] {
  return Array.from({ length: 65 }, (_, index) => {
    const progress = index / 64
    // Opposite points on one ellipse advance in the same direction by half a turn.
    // The front position is (0, 0); the rear position is (0, -10).
    const angle = progress * Math.PI
    const side = incoming ? -1 : 1
    const x = index === 0 || index === 64 ? 0 : side * 20 * Math.sin(angle)
    const y = -5 + side * 5 * Math.cos(angle)
    const depth = (y + 10) / 10
    const scale = .88 + .12 * depth
    return {
      offset: progress,
      transform: `translate(${x}%, ${y}%) scale(${scale})`,
      opacity: incoming ? Math.min(1, progress * 2) : 1 - progress ** 2,
      zIndex: (incoming ? progress >= .5 : progress < .5) ? 2 : 0,
    }
  })
}
