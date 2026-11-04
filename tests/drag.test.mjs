import test from 'node:test'
import assert from 'node:assert/strict'
import { clampWidgetOffset } from '../src/lib/drag.ts'

const base = { x: 120, y: 80 }
const size = { width: 240, height: 180 }
const bounds = { width: 1000, height: 700 }

test('dragging follows the pointer inside the scene', () => {
  assert.deepEqual(clampWidgetOffset({ x: 50, y: -20 }, base, size, bounds), { x: 50, y: -20 })
})

test('dragging cannot hide the widget outside any scene edge', () => {
  assert.deepEqual(clampWidgetOffset({ x: -2000, y: -2000 }, base, size, bounds), { x: -112, y: -72 })
  assert.deepEqual(clampWidgetOffset({ x: 2000, y: 2000 }, base, size, bounds), { x: 632, y: 432 })
})

test('saved offsets are constrained again after a narrow responsive resize', () => {
  const offset = clampWidgetOffset({ x: 600, y: 400 }, { x: 14, y: 560 }, { width: 160, height: 200 }, { width: 360, height: 1100 })
  assert.deepEqual(offset, { x: 178, y: 332 })
})

test('a widget larger than the scene stays anchored where its handle is reachable', () => {
  assert.deepEqual(clampWidgetOffset({ x: 999, y: 999 }, { x: 0, y: 0 }, { width: 600, height: 900 }, { width: 360, height: 700 }), { x: 8, y: 8 })
})
