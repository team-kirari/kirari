import test from 'node:test'
import assert from 'node:assert/strict'
import { observeGallery } from '../src/lib/gallery-reveal.ts'

function card(source) {
  let requests = 0
  let src
  const image = {
    dataset: { src: source },
    hasAttribute: name => name === 'src' && src !== undefined,
    set src(value) { src = value; requests++ },
    get src() { return src },
  }
  return { dataset: {}, querySelector: () => image, image, requests: () => requests }
}

function globalValue(t, name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  })
}

test('gallery requests only approaching images and retains sources across filtering and re-entry', t => {
  let intersect
  let disconnected = false
  const observed = []
  class Observer {
    constructor(callback, options) { intersect = callback; assert.equal(options.rootMargin, '80px 0px') }
    observe(target) { observed.push(target) }
    disconnect() { disconnected = true }
  }
  globalValue(t, 'IntersectionObserver', Observer)
  globalValue(t, 'window', { IntersectionObserver: Observer })
  const first = card('/first.webp')
  const below = card('/below.webp')
  const stop = observeGallery({ querySelectorAll: () => [first, below] })
  assert.deepEqual(observed, [first, below])
  assert.equal(first.requests(), 0)
  assert.equal(below.requests(), 0)
  intersect([{ target: first, isIntersecting: true }])
  assert.equal(first.image.src, '/first.webp')
  assert.equal(first.dataset.visible, 'true')
  assert.equal(below.requests(), 0)
  // A filtered-out or scrolled-away card loses its reveal state, keeping its source.
  intersect([{ target: first, isIntersecting: false }])
  assert.equal(first.dataset.visible, undefined)
  assert.equal(first.image.src, '/first.webp')
  intersect([{ target: first, isIntersecting: true }, { target: below, isIntersecting: true }])
  assert.equal(first.dataset.visible, 'true')
  assert.equal(first.requests(), 1)
  assert.equal(below.requests(), 1)
  stop()
  assert.equal(disconnected, true)
})

test('gallery remains available without IntersectionObserver', t => {
  globalValue(t, 'window', {})
  const item = card('/fallback.webp')
  const stop = observeGallery({ querySelectorAll: () => [item] })
  assert.equal(item.image.src, '/fallback.webp')
  assert.equal(item.dataset.visible, 'true')
  assert.doesNotThrow(stop)
})
