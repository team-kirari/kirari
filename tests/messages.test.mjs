import test from 'node:test'
import assert from 'node:assert/strict'
import { messageText, parseCharacter, parsePublicMessage } from '../src/lib/messages.ts'

test('messages reject corrupt data and preserve markup as plain text', () => {
  const text = '<img src=x onerror=alert(1)> javascript:alert(1)'
  assert.equal(messageText(text), text)
  for (const value of [null, [], {}, 1, '', ' \n\t ', 'x'.repeat(181)]) assert.equal(messageText(value), null)
  for (const value of ['admin', '__proto__', null, {}, 'KENJI']) assert.equal(parseCharacter(value), null)
  const data = { character: 'kenji', text, createdAt: 123 }
  assert.deepEqual(parsePublicMessage('id', data), { id: 'id', ...data })
  for (const change of [{ character: 'fake' }, { text: [] }, { createdAt: Infinity }, { createdAt: -1 }, { createdAt: '123' }, { authorUid: 'private-id' }]) {
    assert.equal(parsePublicMessage('id', { ...data, ...change }), null)
  }
})
