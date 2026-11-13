import test from 'node:test'
import assert from 'node:assert/strict'
import { appearanceGallery } from '../src/lib/gallery.ts'

test('appearance references follow character tags and exclude all profile sources', () => {
  const solo = { src: 'solo.png', tags: ['켄지'] }
  const pair = { src: 'pair.png', tags: ['켄지', '키요'] }
  const other = { src: 'kiyo.png', tags: ['키요'] }
  const profile = { src: 'profile.png', tags: ['켄지', '프로필'] }
  const oldProfile = { src: 'old.png', tags: ['켄지'] }
  const newProfile = { src: 'new.png', tags: ['켄지'] }
  const fallback = { src: 'fallback.png', tags: ['켄지'] }
  const untagged = { src: 'untagged.png', tags: [] }
  const items = [solo, pair, other, profile, oldProfile, newProfile, fallback, untagged]
  assert.deepEqual(appearanceGallery(items, 'kenji', ['old.png', 'new.png', 'fallback.png']), [solo, pair])
  assert.deepEqual(appearanceGallery(items, 'kiyo', []), [pair, other])
  assert.deepEqual(appearanceGallery([profile, other, untagged], 'kenji', []), [])
  assert.deepEqual(appearanceGallery([], 'kiyo', []), [])
  assert.equal(items.length, 8)
})
