export function cardFlipFrames(from: number, direction: -1 | 1): Keyframe[] {
  // Sample one continuous curve so intermediate poses never restart an easing.
  return Array.from({ length: 61 }, (_, index) => {
    const progress = index / 60
    const remaining = progress - 1
    const overshoot = 1.35
    const rotation = index === 0 ? 0 : index === 60 ? 1
      : 1 + (overshoot + 1) * remaining ** 3 + overshoot * remaining ** 2
    // Land during the rotation's settling phase, rather than floating until its end.
    const liftProgress = Math.min(progress / .72, 1)
    const height = liftProgress === 1 ? 0 : Math.sin(Math.PI * liftProgress) ** 2
    return {
      offset: progress,
      easing: 'linear',
      transform: `translateY(${-21 * height}px) scale(${1 + .045 * height}) rotateY(${from + direction * 180 * rotation}deg)`,
    }
  })
}
