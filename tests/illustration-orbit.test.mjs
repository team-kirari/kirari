import test from 'node:test'
import assert from 'node:assert/strict'
import { illustrationOrbitFrames } from '../src/lib/illustration-orbit.ts'

const pose = frame => frame.transform.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number)

test('half-turn swaps keep images upright and stop at the exact front and rear positions', () => {
  for (const incoming of [true, false]) {
    const frames = illustrationOrbitFrames(incoming)
    assert.equal(frames[0].offset, 0)
    assert.equal(frames.at(-1).offset, 1)
    assert.deepEqual(pose(frames.at(-1)), incoming ? [0, 0, 1] : [0, -10, .88])
    assert.equal(frames.at(-1).opacity, incoming ? 1 : 0)
    let previousScale = incoming ? .88 : 1
    for (const frame of frames) {
      assert.doesNotMatch(frame.transform, /rotate|skew/)
      const [x, y, scale] = pose(frame)
      assert.ok(Math.abs(x) <= 20 && y >= -10 && y <= 0)
      assert.ok(scale >= .88 && scale <= 1)
      assert.ok(incoming ? scale >= previousScale : scale <= previousScale)
      previousScale = scale
    }
  }
})

test('both images advance in the same direction on opposite halves of one ellipse', () => {
  const incoming = illustrationOrbitFrames(true)
  const outgoing = illustrationOrbitFrames(false)
  for (let index = 0; index < incoming.length; index++) {
    const [x, y] = pose(incoming[index])
    const [outX, outY] = pose(outgoing[index])
    assert.ok(Math.abs(x + outX) < 1e-12)
    assert.ok(Math.abs(y + outY + 10) < 1e-12)
    for (const frames of [incoming, outgoing]) {
      if (index === 0) continue
      const [previousX, previousY] = pose(frames[index - 1])
      const [currentX, currentY] = pose(frames[index])
      // A consistently negative cross product means both follow the same turn.
      assert.ok(previousX * (currentY + 5) - (previousY + 5) * currentX < 0)
    }
  }
})
