import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_MUSIC_VOLUME, MUSIC_VOLUME_KEY, readMusicVolume, resetMusicVolume, saveMusicVolume } from '../src/lib/music-volume.ts'

test('volume survives new reads including silence and maximum, and reset clears the saved preference', () => {
  const values = new Map()
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }
  assert.equal(readMusicVolume(storage), DEFAULT_MUSIC_VOLUME)
  for (const volume of [23, 0, 100]) {
    saveMusicVolume(storage, volume)
    assert.equal(readMusicVolume(storage), volume)
  }
  resetMusicVolume(storage)
  assert.equal(values.has(MUSIC_VOLUME_KEY), false)
  assert.equal(readMusicVolume(storage), DEFAULT_MUSIC_VOLUME)
})

test('corrupt stored volume and invalid inputs are rejected without writing', () => {
  for (const value of ['', ' ', '-1', '101', 'NaN', 'Infinity', '0.5', '{}', '<script>']) {
    assert.throws(() => readMusicVolume({ getItem: () => value }), /Invalid/)
  }
  for (const value of [-1, 101, NaN, Infinity, 0.5]) {
    assert.throws(() => saveMusicVolume({ setItem: () => assert.fail('must not write') }, value), /Invalid/)
  }
})

test('blocked storage access and failed writes or resets surface to the caller', () => {
  const fail = () => { throw new Error('Storage unavailable') }
  assert.throws(() => readMusicVolume({ getItem: fail }), /Storage unavailable/)
  assert.throws(() => saveMusicVolume({ setItem: fail }, 30), /Storage unavailable/)
  assert.throws(() => resetMusicVolume({ removeItem: fail }), /Storage unavailable/)
})
