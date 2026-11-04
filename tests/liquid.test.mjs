import test from 'node:test'
import assert from 'node:assert/strict'
import { coveringRadius, createLiquidMotion, liquidPath } from '../src/lib/liquid.ts'

test('the liquid reaches every viewport corner even at its smallest edge', () => {
  for (const [x, y, width, height] of [[0, 0, 1440, 900], [720, 450, 1440, 900], [359, 780, 360, 800]]) {
    const radius = coveringRadius(x, y, width, height)
    for (const [cx, cy] of [[0, 0], [width, 0], [width, height], [0, height]]) {
      assert.ok(radius * .66 >= Math.hypot(cx - x, cy - y))
    }
  }
})

test('each motion varies the spread but stays stable across frames and within coverage bounds', () => {
  const outlines = new Set()
  for (let seed = 1; seed <= 30; seed++) {
    let state = seed
    const motion = createLiquidMotion(() => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 2 ** 32
    })
    const path = liquidPath(0, 0, 500, .3, motion)
    outlines.add(path)
    assert.equal(path, liquidPath(0, 0, 500, .3, motion))
    for (let step = 0; step <= 20; step++) {
      const outline = liquidPath(0, 0, 500, step / 20, motion)
      assert.ok(!/NaN|Infinity/.test(outline))
      for (const match of outline.matchAll(/C[^C]*?(-?\d+\.\d+),(-?\d+\.\d+)\s*(?=C|Z)/g)) {
        assert.ok(Math.hypot(Number(match[1]), Number(match[2])) >= 500 * .65)
      }
    }
  }
  assert.equal(outlines.size, 30)
})

test('liquid outline is a closed finite shape and deforms while expanding', () => {
  for (const progress of [0, .25, .5, 1]) {
    const path = liquidPath(100, 200, 500, progress)
    assert.ok(path.startsWith('M'))
    assert.ok(path.endsWith('Z'))
    assert.ok(!/NaN|Infinity/.test(path))
    assert.equal((path.match(/C/g) || []).length, 64)
  }
  assert.notEqual(liquidPath(100, 200, 500, .25), liquidPath(100, 200, 500, .5))
})

test('liquid lobes and indentations travel independently of the expansion', () => {
  const radii = progress => [...liquidPath(0, 0, 500, progress).matchAll(/C[^C]*?(-?\d+\.\d+),(-?\d+\.\d+)\s*(?=C|Z)/g)]
    .map(match => Math.hypot(Number(match[1]), Number(match[2])))
  const before = radii(.2)
  const after = radii(.4)
  assert.equal(before.length, 64)
  assert.equal(after.length, 64)
  assert.ok(before.some((radius, i) => radius - after[i] > 50))
  assert.ok(before.some((radius, i) => after[i] - radius > 50))
  for (let step = 0; step <= 100; step++) {
    for (const radius of radii(step / 100)) assert.ok(radius >= 500 * .65)
  }
})
