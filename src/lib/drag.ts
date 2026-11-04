export type WidgetOffset = { x: number, y: number }

export function clampWidgetOffset(offset: WidgetOffset, base: WidgetOffset, size: { width: number, height: number }, bounds: { width: number, height: number }): WidgetOffset {
  const padding = 8
  const maxLeft = Math.max(padding, bounds.width - size.width - padding)
  const maxTop = Math.max(padding, bounds.height - size.height - padding)
  return {
    x: Math.min(maxLeft, Math.max(padding, base.x + offset.x)) - base.x,
    y: Math.min(maxTop, Math.max(padding, base.y + offset.y)) - base.y,
  }
}
