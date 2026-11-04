import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultSettings, encodeSettings, parseSettings, widgetIds } from '../src/lib/site-settings.ts'

test('shared settings preserve offsets and stacking order through Firestore serialization', () => {
  const value = { ...defaultSettings, hero: 'pair', feather: 12, revision: 3,
    ddays: [{ id: 'anniversary', title: '<script>plain text</script>', date: '2024-02-29' }],
    positions: { guest: { x: -25, y: 40 }, kenji: { x: 20, y: 12 } } }
  const encoded = encodeSettings(value)
  assert.deepEqual(parseSettings(encoded), value)
  assert.deepEqual(Object.keys(parseSettings(encoded).positions), ['guest', 'kenji'])
  for (const id of widgetIds) assert.ok(parseSettings(encodeSettings({ ...defaultSettings, positions: { [id]: { x: 0, y: 0 } } })))
})

test('rejects malformed shared data, executable URLs, excess entries and invalid dates', () => {
  const base = encodeSettings(defaultSettings)
  for (const value of [null, [], {}, { ...base, hero: 'javascript:alert(1)' }, { ...base, feather: NaN },
    { ...base, feather: 41 }, { ...base, feather: 0.5 }, { ...base, revision: -1 }, { ...base, revision: Infinity },
    { ...base, secret: 'extra' }, { ...base, ddays: Array(11).fill(base.ddays[0]) },
    { ...base, ddays: [{ id: 'x', title: 'x', date: '2025-02-29' }] },
    { ...base, ddays: [{ id: 'x', title: 'x', date: '0000-01-01' }] },
    { ...base, ddays: [{ id: '<img>', title: 'x', date: '' }] },
    { ...base, ddays: [{ id: 'x', title: 'x'.repeat(41), date: '' }] },
    { ...base, ddays: [base.ddays[0], base.ddays[0]] },
    ...['__proto__', 'unknown'].map(id => ({ ...base, positions: [{ id, x: 0, y: 0 }] })),
    ...[NaN, Infinity, 4001, '10px'].map(x => ({ ...base, positions: [{ id: 'kenji', x, y: 0 }] })),
    { ...base, positions: [{ id: 'kenji', x: 0, y: 0 }, { id: 'kenji', x: 1, y: 1 }] },
  ]) assert.equal(parseSettings(value), null)
})
