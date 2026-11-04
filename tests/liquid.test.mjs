import test from 'node:test'
import assert from 'node:assert/strict'
import { coveringRadius, liquidPath } from '../src/lib/liquid.ts'

test('the liquid reaches every viewport corner even at its smallest edge', () => {
  for (const [x, y, width, height] of [[0, 0, 1440, 900], [720, 450, 1440, 900], [359, 780, 360, 800]]) {
    const radius = coveringRadius(x, y, width, height)
    for (const [cx, cy] of [[0, 0], [width, 0], [width, height], [0, height]]) {
      assert.ok(radius * .84 >= Math.hypot(cx - x, cy - y))
    }
  }
})

test('liquid outline is a closed finite shape and deforms while expanding', () => {
  for (const progress of [0, .25, .5, 1]) {
    const path = liquidPath(100, 200, 500, progress)
    assert.ok(path.startsWith('M'))
    assert.ok(path.endsWith('Z'))
    assert.ok(!/NaN|Infinity/.test(path))
    assert.equal((path.match(/L/g) || []).length, 160)
  }
  assert.notEqual(liquidPath(100, 200, 500, .25), liquidPath(100, 200, 500, .5))
})
