import test from 'node:test'
import assert from 'node:assert/strict'
import { preparePage } from '../src/lib/prepare-page.ts'

const turn = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function environment(t) {
  const observers = []
  const fonts = deferred()
  const root = {
    images: [], busy: false,
    getBoundingClientRect: () => ({ top: 100 }),
    querySelectorAll() { return this.images },
    querySelector() { return this.busy ? {} : null },
  }
  const globals = {
    window: { setTimeout, clearTimeout, innerHeight: 800 },
    document: { fonts: { load: () => fonts.promise } },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.connected = false; observers.push(this) }
      observe() { this.connected = true }
      disconnect() { this.connected = false }
    },
  }
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key] })
  }
  function image(src, top = 120, loading = 'lazy') {
    const decoded = deferred()
    let calls = 0
    return { src, currentSrc: src, loading, decoded, get calls() { return calls },
      getBoundingClientRect: () => ({ top }),
      decode() { calls++; return decoded.promise },
    }
  }
  return { root, fonts, image, observers, notify() { observers.filter(item => item.connected).forEach(item => item.callback()) } }
}

test('destination waits for both font loading and image decoding, leaving distant gallery images lazy', async t => {
  const env = environment(t)
  const first = env.image('/first.webp'), distant = env.image('/distant.webp', 3000)
  env.root.images = [first, distant]
  let done = false
  const ready = preparePage(env.root, new AbortController().signal).then(() => { done = true })
  assert.equal(first.loading, 'eager')
  assert.equal(first.calls, 1)
  assert.equal(distant.calls, 0)
  first.decoded.resolve()
  await turn()
  assert.equal(done, false)
  env.fonts.resolve([])
  await ready
  assert.equal(env.observers[0].connected, false)
})

test('data arriving during preparation also warms newly rendered images before revealing', async t => {
  const env = environment(t)
  env.root.busy = true
  env.fonts.resolve([])
  let done = false
  const ready = preparePage(env.root, new AbortController().signal).then(() => { done = true })
  await turn()
  assert.equal(done, false)
  const arrived = env.image('/selected-profile.webp')
  env.root.images = [arrived]
  env.root.busy = false
  env.notify()
  await turn()
  assert.equal(done, false)
  assert.equal(arrived.calls, 1)
  arrived.decoded.resolve()
  await ready
})

test('broken images and fonts release preparation to the existing error UI', async t => {
  const env = environment(t)
  const broken = env.image('/broken.webp')
  env.root.images = [broken]
  const ready = preparePage(env.root, new AbortController().signal)
  broken.decoded.reject(new Error('decode failed'))
  env.fonts.reject(new Error('font failed'))
  await ready
  assert.equal(env.observers[0].connected, false)
})

test('offline data has a deadline and superseded preparation disconnects immediately', async t => {
  const env = environment(t)
  env.root.busy = true
  await preparePage(env.root, new AbortController().signal, 10)
  assert.equal(env.observers[0].connected, false)
  const controller = new AbortController()
  const ready = preparePage(env.root, controller.signal)
  controller.abort()
  await ready
  assert.equal(env.observers[1].connected, false)
})
