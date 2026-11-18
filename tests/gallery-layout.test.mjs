import test from 'node:test'
import assert from 'node:assert/strict'
import { masonryPositions, layoutGallery } from '../src/lib/gallery-layout.ts'

test('masonry starts left to right, then fills the shortest column without row-sized gaps', () => {
  const heights = [300, 100, 200, 80, 60]
  const result = masonryPositions(heights, 3, 100, 10, 20)
  assert.deepEqual(result, {
    positions: [
      { left: 0, top: 0 }, { left: 110, top: 0 }, { left: 220, top: 0 },
      { left: 110, top: 120 }, { left: 110, top: 220 },
    ],
    height: 300,
  })
  assert.deepEqual(heights, [300, 100, 200, 80, 60])
})

test('masonry adapts to one column and filtered or empty results', () => {
  assert.deepEqual(masonryPositions([100, 80, 200], 1, 300, 0, 22), {
    positions: [{ left: 0, top: 0 }, { left: 0, top: 122 }, { left: 0, top: 224 }], height: 424,
  })
  assert.deepEqual(masonryPositions([100, 80], 3, 100, 10, 22), {
    positions: [{ left: 0, top: 0 }, { left: 110, top: 0 }], height: 100,
  })
  assert.deepEqual(masonryPositions([], 3, 100, 10, 22), { positions: [], height: 0 })
})

test('layout measures photos at their column width, keeps nodes and responds to decoded heights', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle')
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '2', columnGap: '10px', rowGap: '20px' })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'getComputedStyle', original)
    else delete globalThis.getComputedStyle
  })
  const cards = [100, 200, 50].map(height => ({
    style: {}, height,
    get offsetHeight() { assert.equal(this.style.width, '100px'); return this.height },
  }))
  const root = {
    clientWidth: 210, style: {}, dataset: {},
    querySelectorAll(selector) { assert.equal(selector, '.gallery-item:not([hidden])'); return cards },
  }
  layoutGallery(root)
  assert.equal(root.dataset.masonryReady, 'true')
  assert.deepEqual(cards.map(card => [card.style.left, card.style.top]), [['0px', '0px'], ['110px', '0px'], ['0px', '120px']])
  assert.equal(root.style.height, '200px')
  cards[0].height = 300
  layoutGallery(root)
  assert.deepEqual(cards.map(card => [card.style.left, card.style.top]), [['0px', '0px'], ['110px', '0px'], ['110px', '220px']])
  assert.equal(root.style.height, '300px')
  root.clientWidth = 0
  assert.doesNotThrow(() => layoutGallery(root))
})
