import test from 'node:test'
import assert from 'node:assert/strict'
import { loadYouTubeAPI, musicEmbedURL, musicError, musicPlayerVars, musicTrack, playMusic } from '../src/lib/youtube.ts'

test('track metadata validates remote values and removes the Topic channel suffix', () => {
  assert.deepEqual(musicTrack({ title: 'Kirari', author: 'Fujii Kaze - Topic' }), { title: 'Kirari', artist: 'Fujii Kaze' })
  for (const value of [null, 'song', { title: 123 }, { title: ' ' }, { title: 'a'.repeat(501) }]) {
    assert.equal(musicTrack(value), null)
  }
  assert.equal(musicTrack({ title: 'Song', author: {} }).artist, '아티스트 정보 없음')
  assert.equal(musicTrack({ title: '<script>alert(1)</script>', author: 'Artist' }).title, '<script>alert(1)</script>')
})

test('player prepares the requested playlist without autoplay', () => {
  const options = musicPlayerVars('https://example.github.io')
  assert.equal(options.origin, 'https://example.github.io')
  assert.equal(options.listType, 'playlist')
  assert.equal(options.autoplay, 0)
  assert.equal(options.list, 'PLWkyrpbKwvqA')
})

test('play restores audible volume before starting a previously muted player', () => {
  let muted = true
  let volume = 0
  let starts = 0
  const player = {
    setVolume(value) { volume = value },
    unMute() { muted = false },
    playVideo() {
      assert.equal(muted, false)
      assert.equal(volume, 40)
      starts++
    },
  }
  playMusic(player, 40)
  assert.equal(starts, 1)
})

test('embed starts with the requested video and loops the requested playlist', () => {
  const url = new URL(musicEmbedURL('https://example.github.io'))
  assert.equal(url.origin, 'https://www.youtube.com')
  assert.equal(url.pathname, '/embed/IFCDLIKSArs')
  assert.equal(url.searchParams.get('list'), 'PLWkyrpbKwvqA')
  assert.equal(url.searchParams.get('listType'), 'playlist')
  assert.equal(url.searchParams.has('playlist'), false)
  assert.equal(url.searchParams.get('origin'), 'https://example.github.io')
  assert.equal(url.searchParams.get('enablejsapi'), '1')
  assert.equal(url.searchParams.get('loop'), '1')
})

test('playback errors distinguish missing identity from unavailable videos', () => {
  assert.match(musicError(153), /출처/)
  assert.doesNotMatch(musicError(153), /비공개/)
  assert.match(musicError(100), /비공개/)
  assert.match(musicError(150), /다음 곡/)
  assert.match(musicError(999), /999/)
})

test('YouTube loader shares pending requests and recovers after a blocked script', async () => {
  const scripts = []
  const timeouts = new Map()
  let timerId = 0
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  let previousCalled = 0
  globalThis.window = {
    setTimeout(callback) { const id = ++timerId; timeouts.set(id, callback); return id },
    clearTimeout(id) { timeouts.delete(id) },
    onYouTubeIframeAPIReady() { previousCalled++ },
  }
  globalThis.document = {
    createElement() { return { remove() { this.removed = true } } },
    head: { append(script) { scripts.push(script) } },
  }
  try {
    const first = loadYouTubeAPI()
    assert.equal(loadYouTubeAPI(), first)
    assert.equal(scripts.length, 1)
    assert.equal(scripts[0].src, 'https://www.youtube.com/iframe_api')
    scripts[0].onerror()
    await assert.rejects(first, /could not be loaded/)
    assert.equal(scripts[0].removed, true)
    assert.equal(timeouts.size, 0)

    const retry = loadYouTubeAPI()
    assert.equal(scripts.length, 2)
    globalThis.window.YT = { Player: class {} }
    globalThis.window.onYouTubeIframeAPIReady()
    assert.equal(await retry, globalThis.window.YT)
    assert.equal(previousCalled, 1)
    assert.equal(timeouts.size, 0)
    assert.equal(await loadYouTubeAPI(), globalThis.window.YT)
    assert.equal(scripts.length, 2)
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})
