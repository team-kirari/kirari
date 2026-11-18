import test from 'node:test'
import assert from 'node:assert/strict'
import { applyLogVolume, readLogVolume, resetLogVolume, saveLogVolume } from '../src/lib/trpg-volume.ts'

test('BGM preferences survive new reads independently per channel, including zero and mute, and reset removes them', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  assert.deepEqual(readLogVolume(storage, 1), { volume: null, muted: false })
  saveLogVolume(storage, 1, { volume: 0, muted: false })
  saveLogVolume(storage, 2, { volume: 37, muted: true })
  assert.deepEqual(readLogVolume(storage, 1), { volume: 0, muted: false })
  assert.deepEqual(readLogVolume(storage, 2), { volume: 37, muted: true })
  resetLogVolume(storage, 1)
  assert.deepEqual(readLogVolume(storage, 1), { volume: null, muted: false })
  assert.deepEqual(readLogVolume(storage, 2), { volume: 37, muted: true })
  saveLogVolume(storage, 1, { volume: null, muted: true })
  assert.deepEqual(readLogVolume(storage, 1), { volume: null, muted: true })
})

test('corrupt preferences, invalid channel and blocked storage surface errors without unsafe writes', () => {
  for (const value of ['{}', 'null', '[]', '{', '{"volume":101,"muted":false}', '{"volume":"0","muted":false}', '{"volume":0,"muted":"false"}', ' '.repeat(101)]) {
    assert.throws(() => readLogVolume({ getItem: () => value }, 1))
  }
  for (const volume of [-1, 101, NaN, Infinity, '0']) assert.throws(() => saveLogVolume({ setItem: () => assert.fail('must not write') }, 1, { volume, muted: false }))
  assert.throws(() => readLogVolume({ getItem: () => assert.fail('must not read') }, 3))
  const fail = () => { throw new Error('Storage unavailable') }
  assert.throws(() => readLogVolume({ getItem: fail }, 1), /Storage unavailable/)
  assert.throws(() => saveLogVolume({ setItem: fail }, 1, { volume: 42, muted: false }), /Storage unavailable/)
  assert.throws(() => resetLogVolume({ removeItem: fail }, 1), /Storage unavailable/)
})

test('zero volume explicitly mutes audio and YouTube through playback retries and track changes', () => {
  const audio = { volume: 1, muted: false }
  const calls = []
  const player = { setVolume: value => calls.push(['volume', value]), mute: () => calls.push(['mute']), unMute: () => calls.push(['unmute']) }
  for (let attempt = 0; attempt < 3; attempt++) applyLogVolume(audio, player, 0)
  assert.equal(audio.volume, 0)
  assert.equal(audio.muted, true)
  assert.deepEqual(calls, Array.from({ length: 3 }, () => [['volume', 0], ['mute']]).flat())
  applyLogVolume(audio, player, 32)
  assert.equal(audio.volume, .32)
  assert.equal(audio.muted, false)
  assert.deepEqual(calls.slice(-2), [['volume', 32], ['unmute']])
  const replacement = { volume: 1, muted: false }
  applyLogVolume(replacement, player, 0)
  assert.equal(replacement.muted, true)
})

test('volume is bounded and invalid volume fails silent for either media backend', () => {
  const audio = { volume: 1, muted: false }
  for (const value of [-1, NaN, Infinity]) {
    applyLogVolume(audio, null, value)
    assert.equal(audio.volume, 0)
    assert.equal(audio.muted, true)
  }
  applyLogVolume(audio, null, 200)
  assert.equal(audio.volume, 1)
  assert.equal(audio.muted, false)
  applyLogVolume(null, null, 0)
})
