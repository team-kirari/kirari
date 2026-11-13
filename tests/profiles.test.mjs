import test from 'node:test'
import assert from 'node:assert/strict'
import { createProfiles, parsePublishedProfile, validProfile, validPhotoSelection, emptyPhotoSelection, profileFullName, profileAge } from '../src/lib/profiles.ts'

test('published profiles require a complete bounded schema and a safe revision', () => {
  const profile = createProfiles().kenji
  assert.equal(validProfile(profile), true)
  assert.deepEqual(parsePublishedProfile({ profile, revision: 1 }), { profile, revision: 1, photoSelection: emptyPhotoSelection() })
  for (const value of [null, [], {}, { profile, revision: 0 }, { profile, revision: 1.5 },
    { profile, revision: Number.MAX_SAFE_INTEGER }, { profile, revision: 1, secret: 'unexpected' },
    { profile: { ...profile, name: 1 }, revision: 1 }, { profile: { ...profile, hidden: 'extra' }, revision: 1 }]) {
    assert.equal(parsePublishedProfile(value), null)
  }
})

test('invalid field values, damaged data and excessive text are rejected', () => {
  const profile = createProfiles().kiyo
  for (const patch of [{ name: ' ' }, { name: 'a'.repeat(81) }, { outside: 'a'.repeat(4001) },
    { likes: {} }, { color: 'url(javascript:alert(1))' }, { speech: 'unrecognized' },
    { age: 'x'.repeat(81) }, { age: 20 }, { surname: 'x'.repeat(81) }, { height: '0' },
    { height: '501' }, { weight: '1e2' }, { weight: '3.55' }]) {
    assert.equal(validProfile({ ...profile, ...patch }), false)
  }
  assert.equal(validProfile({ ...profile, age: '999', height: '500', weight: '1.1', speech: '혼용' }), true)
  // These remain plain React text; no HTML or URL interpretation is permitted.
  assert.equal(validProfile({ ...profile, quote: '<img src=x onerror=alert(1)>', likes: 'javascript:alert(1)' }), true)
})


test('public photo selections persist by filename and reject malformed selection records', () => {
  const photoSelection = { old: { 'old.png': true }, new: { 'new.webp': true } }
  const profile = createProfiles().kenji
  assert.equal(validPhotoSelection(photoSelection), true)
  assert.deepEqual(parsePublishedProfile({ profile, revision: 2, photoSelection }).photoSelection, photoSelection)
  for (const selection of [null, [], {}, { old: {}, new: {}, extra: {} }, { old: [], new: {} },
    { old: { 'photo.png': false }, new: {} }, { old: { '../photo.png': true }, new: {} },
    { old: { 'javascript:alert(1)': true }, new: {} }, { old: { 'photo.svg': true }, new: {} }, { old: { ['bad' + String.fromCharCode(10) + '.png']: true }, new: {} }]) {
    assert.equal(validPhotoSelection(selection), false)
    assert.equal(parsePublishedProfile({ profile, revision: 2, photoSelection: selection }), null)
  }
})


test('separate names, free text ages and legacy profiles preserve published content', () => {
  const profile = { ...createProfiles().kenji, surname: '긴 성', name: '이름', age: '20대 초반' }
  assert.equal(validProfile(profile), true)
  assert.equal(profileFullName(profile), '긴 성 이름')
  assert.equal(profileFullName({ ...profile, surname: '' }), '이름')
  assert.equal(profileAge(profile.age), '20대 초반세')
  assert.equal(profileAge('20'), '20세')
  assert.equal(profileAge('20세 '), '20세')
  assert.equal(profileAge(' '), '—')
  const { surname, ...legacyFields } = profile
  assert.equal(surname, '긴 성')
  const legacy = { ...legacyFields, name: '이전 전체 이름', occupation: '이전 직업' }
  const parsed = parsePublishedProfile({ profile: legacy, revision: 3 })
  assert.deepEqual(parsed.profile, { ...legacyFields, name: '이전 전체 이름', surname: '' })
  assert.equal(validProfile(parsed.profile), true)
  for (const patch of [{ unexpected: '' }, { occupation: {} }, { occupation: 'x'.repeat(4001) }, { name: null }]) {
    assert.equal(parsePublishedProfile({ profile: { ...legacy, ...patch }, revision: 3 }), null)
  }
  assert.equal(validProfile({ ...profile, age: '<img src=x onerror=alert(1)>', surname: '<script>' }), true)
})
