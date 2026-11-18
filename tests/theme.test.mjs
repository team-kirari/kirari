import test from 'node:test'
import assert from 'node:assert/strict'
import { THEME_KEY, readTheme, resetTheme, saveTheme } from '../src/lib/theme.ts'

test('theme persists across reads and can be reset for this browser', () => {
  const values = new Map()
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }
  assert.equal(readTheme(storage), 'blue')
  for (const theme of ['blue', 'pink', 'monochrome']) {
    saveTheme(storage, theme)
    assert.equal(readTheme(storage), theme)
  }
  resetTheme(storage)
  assert.equal(values.has(THEME_KEY), false)
  assert.equal(readTheme(storage), 'blue')
})

test('corrupt storage falls back safely and invalid themes cannot be written', () => {
  for (const value of ['{}', '', 'constructor', '<script>', 'pink ', null]) {
    assert.equal(readTheme({ getItem: () => value }), 'blue')
    if (value !== null) assert.throws(() => saveTheme({ setItem: () => assert.fail('must not write') }, value))
  }
})

test('storage failures reach the caller for a visible unsaved status', () => {
  const fail = () => { throw new Error('Storage unavailable') }
  assert.throws(() => readTheme({ getItem: fail }), /Storage unavailable/)
  assert.throws(() => saveTheme({ setItem: fail }, 'pink'), /Storage unavailable/)
  assert.throws(() => resetTheme({ removeItem: fail }), /Storage unavailable/)
})
