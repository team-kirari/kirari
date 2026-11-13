import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot, setLogLevel } from 'firebase/firestore'
import { createProfiles, parsePublishedProfile } from '../src/lib/profiles.ts'

setLogLevel('silent')
const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
const environment = await initializeTestEnvironment({ projectId: 'demo-kirari-profiles', firestore: { rules, host: '127.0.0.1', port: Number(process.env.PROFILES_EMULATOR_PORT ?? 8089) } })
const identity = (uid, verified = true, provider = 'google.com') => environment.authenticatedContext(uid, {
  email_verified: verified, firebase: { sign_in_provider: provider },
}).firestore()
const guest = environment.unauthenticatedContext().firestore()
const adminA = identity('admin-a'), adminB = identity('admin-b')
const reference = (db, person = 'kenji') => doc(db, 'profiles', person)
const payload = { profile: createProfiles().kenji, revision: 1 }
try {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async context => {
    for (const uid of ['admin-a', 'admin-b', 'unverified', 'password']) await setDoc(doc(context.firestore(), 'admins', uid), { enabled: true })
  })
  for (const db of [guest, identity('member-a'), identity('member-b'), identity('unverified', false), identity('password', true, 'password')]) {
    await assertSucceeds(getDoc(reference(db)))
    await assertFails(setDoc(reference(db), payload))
  }
  await assertSucceeds(setDoc(reference(adminA), payload))
  await assertSucceeds(setDoc(reference(adminB, 'kiyo'), { profile: createProfiles().kiyo, revision: 1 }))
  for (const db of [guest, adminA, adminB]) {
    assert.deepEqual((await assertSucceeds(getDoc(reference(db)))).data(), payload)
    await assertFails(getDoc(reference(db, 'private')))
    await assertFails(getDocs(collection(db, 'profiles')))
    await assertFails(deleteDoc(reference(db)))
  }
  const observed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { unsubscribe(); reject(new Error('listener timeout')) }, 10000)
    const unsubscribe = onSnapshot(reference(guest), snapshot => {
      if (snapshot.data()?.revision === 2) { clearTimeout(timeout); unsubscribe(); resolve(snapshot.data()) }
    }, reject)
  })
  await assertSucceeds(setDoc(reference(adminB), { profile: { ...payload.profile, surname: '긴 성', name: '공용 이름', age: '20대 초반', height: '1.1' }, revision: 2 }))
  assert.equal((await observed).profile.name, '공용 이름')
  await assertFails(setDoc(reference(adminA), { ...payload, revision: 2 }))
  await assertFails(setDoc(reference(adminA), { ...payload, revision: 4 }))
  for (const patch of [{ name: '' }, { name: '   ' }, { quote: 'x'.repeat(4001) }, { color: 'javascript:alert(1)' },
    { age: 'x'.repeat(81) }, { age: 20 }, { surname: 'x'.repeat(81) }, { surname: null }, { occupation: '' }, { height: '0' }, { weight: '501' }, { speech: 'invalid' }, { extra: true }]) {
    await assertFails(setDoc(reference(adminA), { profile: { ...payload.profile, ...patch }, revision: 3 }))
  }
  await assertFails(setDoc(reference(adminA), { profile: { name: 'incomplete' }, revision: 3 }))
  await assertFails(setDoc(reference(adminA), { ...payload, revision: 3, extra: true }))
  const legacyProfile = { ...payload.profile, occupation: '이전 직업' }
  delete legacyProfile.surname
  await environment.withSecurityRulesDisabled(context => setDoc(reference(context.firestore(), 'kiyo'), { profile: legacyProfile, revision: 1 }))
  const migrated = parsePublishedProfile((await assertSucceeds(getDoc(reference(guest, 'kiyo')))).data())
  assert.equal(migrated.profile.surname, '')
  await assertSucceeds(setDoc(reference(adminB, 'kiyo'), { profile: { ...migrated.profile, surname: '분리한 성', age: '불명' }, revision: 2 }))
  assert.equal((await assertSucceeds(getDoc(reference(guest, 'kiyo')))).data().profile.age, '불명')
  const photoSelection = { old: { 'old.png': true }, new: { 'new.webp': true } }
  await assertSucceeds(setDoc(reference(adminA), { ...payload, photoSelection, revision: 3 }))
  assert.deepEqual((await assertSucceeds(getDoc(reference(guest)))).data().photoSelection, photoSelection)
  for (const selection of [[], { old: [], new: {} }, { old: { 'a.png': false }, new: {} }, { old: {}, new: {}, extra: {} }]) {
    await assertFails(setDoc(reference(adminB), { ...payload, photoSelection: selection, revision: 4 }))
  }
  await environment.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'admins', 'admin-a'), { enabled: false }))
  await assertFails(setDoc(reference(adminA), { ...payload, photoSelection, revision: 4 }))
  console.log('PASS: public profiles, admin A/B updates, guest/member denial, live sync, conflict, validation, revocation')
} finally {
  await environment.cleanup()
}
