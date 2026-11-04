import test from 'node:test'
import assert from 'node:assert/strict'
import { guestText, parseGuestNote } from '../src/lib/guestbook.ts'

test('guestbook validates text without treating HTML or URLs as markup', () => {
  for (const value of [null, [], {}, '', ' \n\t', 'x'.repeat(181)]) assert.equal(guestText(value), null)
  assert.equal(guestText('  hello  '), 'hello')
  const text = '<img src=x onerror=alert(1)> javascript:alert(1)'
  assert.equal(guestText(text), text)
  assert.equal(guestText('x'.repeat(180)), 'x'.repeat(180))
})

test('guestbook rejects corrupt records, timestamps and document paths', () => {
  const id = 'abcdefghijklmnopqrst'
  const valid = { text: 'hello', createdAt: 100 }
  assert.deepEqual(parseGuestNote(id, valid), { id, ...valid })
  for (const data of [null, [], {}, { ...valid, private: true }, { ...valid, text: [] },
    { ...valid, createdAt: NaN }, { ...valid, createdAt: Infinity }, { ...valid, createdAt: 1e100 }, { ...valid, createdAt: -1 }]) {
    assert.equal(parseGuestNote(id, data), null)
  }
  for (const bad of ['', '../test', 'a/b', 'x'.repeat(21)]) assert.equal(parseGuestNote(bad, valid), null)
})
