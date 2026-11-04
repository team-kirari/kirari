import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, setLogLevel, Timestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { defaultSettings, encodeSettings, widgetIds } from '../src/lib/site-settings.ts'

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
// Denied writes are expected assertions; failures still throw with their details.
setLogLevel('silent')
const environment = await initializeTestEnvironment({ projectId: 'demo-kirari', firestore: { rules, host: '127.0.0.1', port: 8088 } })
const identity = (uid, email, verified = true, provider = 'google.com') => environment.authenticatedContext(uid, {
  email, email_verified: verified, firebase: { sign_in_provider: provider },
}).firestore()
const guest = environment.unauthenticatedContext().firestore()
const adminA = identity('admin-a', 'admin-one@example.test')
const adminB = identity('admin-b', 'admin-two@example.test')
const appearance = db => doc(db, 'site', 'appearance')
const payload = encodeSettings({ ...defaultSettings, revision: 1 })
const layout = db => doc(db, 'site', 'layout')
function publish(db, data) {
  const { positions, ...appearanceData } = data
  return writeBatch(db).set(appearance(db), appearanceData).set(layout(db), { positions, revision: data.revision }).commit()
}
const initialAppearance = { ...payload }; delete initialAppearance.positions

try {
  await environment.clearFirestore()
  // Membership is seeded only through trusted administrative access, never a client.
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'admins', 'admin-a'), { enabled: true })
    await setDoc(doc(context.firestore(), 'admins', 'admin-b'), { enabled: true })
    await setDoc(doc(context.firestore(), 'admins', 'unverified'), { enabled: true })
    await setDoc(doc(context.firestore(), 'admins', 'password'), { enabled: true })
  })
  const member = identity('member-a', 'member-a@example.test')
  for (const [db, uid] of [[guest, 'guest'], [member, 'member-a'], [adminA, 'admin-a'], [adminB, 'admin-b']]) {
    await assertFails(getDocs(collection(db, 'admins')))
    await assertFails(getDoc(doc(db, 'admins', uid === 'admin-a' ? 'admin-b' : 'admin-a')))
    await assertFails(setDoc(doc(db, 'admins', uid), { enabled: true }))
    await assertFails(updateDoc(doc(db, 'admins', 'admin-b'), { enabled: true }))
    await assertFails(deleteDoc(doc(db, 'admins', 'admin-b')))
  }
  assert.equal((await assertSucceeds(getDoc(doc(adminA, 'admins', 'admin-a')))).data().enabled, true)
  assert.equal((await assertSucceeds(getDoc(doc(member, 'admins', 'member-a')))).exists(), false)
  await assertFails(publish(identity('impostor', 'admin-one@example.test'), payload))
  await assertSucceeds(getDoc(appearance(guest)))
  for (const db of [guest, identity('member-a', 'member-a@example.test'), identity('member-b', 'member-b@example.test'),
    identity('unverified', 'admin-one@example.test', false), identity('password', 'admin-one@example.test', true, 'password')]) {
    await assertFails(publish(db, payload))
  }
  await assertSucceeds(publish(adminA, payload))
  for (const db of [guest, adminA, adminB]) {
    assert.deepEqual((await assertSucceeds(getDoc(appearance(db)))).data(), initialAppearance)
    assert.equal((await assertSucceeds(getDoc(layout(db)))).data().revision, 1)
    await assertFails(getDocs(collection(db, 'site')))
    await assertFails(deleteDoc(appearance(db)))
    await assertFails(getDoc(doc(db, 'site', 'private')))
  }
  // The second admin can publish and a separate guest listener sees that revision.
  const observed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { unsubscribe(); reject(new Error('listener timeout')) }, 10000)
    const unsubscribe = onSnapshot(appearance(guest), snapshot => {
      if (snapshot.data()?.revision === 2) { clearTimeout(timeout); unsubscribe(); resolve(snapshot.data()) }
    }, error => { clearTimeout(timeout); reject(error) })
  })
  await assertSucceeds(publish(adminB, { ...payload, hero: 'pair', revision: 2 }))
  assert.equal((await observed).hero, 'pair')
  await assertFails(updateDoc(appearance(adminA), { feather: 4, revision: 3 }))
  await assertFails(updateDoc(layout(adminA), { positions: [], revision: 3 }))
  await assertFails(updateDoc(appearance(adminA), { hero: 'portrait', revision: 2 }))
  for (const change of [{ hero: 'javascript:alert(1)' }, { feather: 41 }, { feather: 1.5 }, { secret: 'extra' },
    { ddays: Array(11).fill(payload.ddays[0]) }, { ddays: [{ id: '../bad', title: 'x', date: '' }] },
    { ddays: [{ id: 'x', title: 'x'.repeat(41), date: '' }] }, { ddays: [{ id: 'x', title: 'x', date: '2026-13-01' }] },
    { positions: [{ id: '__proto__', x: 0, y: 0 }] }, { positions: [{ id: 'kenji', x: 4001, y: 0 }] },
    { positions: [{ id: 'kenji', x: '1', y: 0 }] }, { ddays: [{ id: 'x', title: [], date: '' }] },
    { ddays: [{ id: 'x', title: 'x', date: '2025-02-29' }] },
    { ddays: [{ id: 'x', title: 'x', date: '' }, { id: 'x', title: 'y', date: '' }] },
    { positions: [{ id: 'kenji', x: 0, y: 0 }, { id: 'kenji', x: 1, y: 1 }] },
    { ddays: [{ id: 'x', title: 'x' }] }, { positions: [{ id: 'kenji', x: 0 }] },
  ]) await assertFails(publish(adminA, { ...payload, hero: 'pair', ...change, revision: 3 }))

  console.log('CHECK: input bounds passed')
  // Exercise transaction preconditions with two admins racing from the same revision.
  const racePublish = db => runTransaction(db, async transaction => {
    const snapshot = await transaction.get(appearance(db))
    await transaction.get(layout(db))
    if (snapshot.data().revision !== 2) throw new Error('settings-conflict')
    transaction.update(appearance(db), { feather: 8, revision: 3 })
    transaction.update(layout(db), { revision: 3 })
  })
  const results = await Promise.allSettled([racePublish(adminA), racePublish(adminB)])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter(result => result.status === 'rejected').length, 1)
  assert.equal((await getDoc(appearance(guest))).data().revision, 3)
  console.log('CHECK: conflict passed; validating maximum settings')
  await assertSucceeds(publish(adminA, encodeSettings({ ...defaultSettings, revision: 4,
    ddays: Array.from({ length: 10 }, (_, i) => ({ id: `day-${i}`, title: 'x'.repeat(40), date: '2024-02-29' })),
    positions: Object.fromEntries(widgetIds.map(id => [id, { x: -4000, y: 4000 }])) })))

  // Revocation reaches the self-role listener and immediately denies later writes.
  const revoked = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { unsubscribe(); reject(new Error('revocation timeout')) }, 10000)
    const unsubscribe = onSnapshot(doc(adminA, 'admins', 'admin-a'), snapshot => {
      if (snapshot.data()?.enabled === false) { clearTimeout(timeout); unsubscribe(); resolve() }
    }, error => { clearTimeout(timeout); reject(error) })
  })
  await environment.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'admins', 'admin-a'), { enabled: false })
  })
  await revoked
  await assertFails(publish(adminA, { ...payload, revision: 5 }))
  await environment.withSecurityRulesDisabled(async context => {
    await deleteDoc(doc(context.firestore(), 'admins', 'admin-b'))
  })
  await assertFails(publish(adminB, { ...payload, revision: 5 }))
  // Adding membership enables the existing UID without any code/email changes.
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'admins', 'member-a'), { enabled: true })
  })
  await assertSucceeds(publish(member, { ...payload, revision: 5 }))

  const counter = doc(guest, 'counters', 'likes')
  await assertSucceeds(setDoc(counter, { total: 1 }))
  await assertSucceeds(updateDoc(counter, { total: 2 }))
  await assertFails(updateDoc(counter, { total: 0 }))
  await assertFails(updateDoc(counter, { total: 10 }))

  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'admins', 'admin-a'), { enabled: true, character: 'kenji' })
    await setDoc(doc(context.firestore(), 'admins', 'admin-b'), { enabled: true, character: 'kiyo' })
    await setDoc(doc(context.firestore(), 'admins', 'unverified'), { enabled: true, character: 'kenji' })
    await setDoc(doc(context.firestore(), 'admins', 'password'), { enabled: true, character: 'kenji' })
  })
  const post = (db, character, extra = {}) => setDoc(doc(collection(db, 'messages')), { character, text: '공개 테스트', createdAt: serverTimestamp(), ...extra })
  const latest = db => query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(30))
  for (const db of [guest, identity('member-b', 'member-b@example.test'), identity('unverified', 'a@example.test', false), identity('password', 'a@example.test', true, 'password')]) {
    await assertFails(post(db, 'kenji'))
    await assertSucceeds(getDocs(latest(db)))
  }
  await assertFails(post(member, 'kenji')) // enabled admin without a character
  await assertSucceeds(post(adminA, 'kenji'))
  await assertSucceeds(post(adminB, 'kiyo'))
  await assertFails(post(adminA, 'kiyo'))
  await assertFails(post(adminB, 'kenji'))
  await assertSucceeds(post(adminA, 'kenji', { text: '<img src=x onerror=alert(1)> javascript:alert(1)' }))
  for (const extra of [{ character: 'fake' }, { text: '' }, { text: ' \n\t ' }, { text: 'x'.repeat(181) }, { text: [] }, { authorUid: 'fake' }, { createdAt: Timestamp.fromMillis(1) }]) {
    await assertFails(post(adminA, 'kenji', extra))
  }
  await assertSucceeds(post(adminA, 'kenji', { text: 'x'.repeat(180) }))
  const posted = await assertSucceeds(getDocs(latest(guest)))
  assert.equal(posted.size, 4)
  assert.deepEqual(Object.keys(posted.docs[0].data()).sort(), ['character', 'createdAt', 'text'])
  const message = doc(adminA, 'messages', posted.docs[0].id)
  await assertSucceeds(getDoc(doc(guest, 'messages', posted.docs[0].id)))
  await assertFails(updateDoc(message, { text: 'changed' }))
  for (const db of [guest, identity('member-b', 'member-b@example.test'), identity('unverified', 'a@example.test', false), identity('password', 'a@example.test', true, 'password')]) {
    await assertFails(deleteDoc(doc(db, 'messages', message.id)))
  }
  // Both admins can remove either character's messages, including each other's.
  for (const [db, character] of [[adminA, 'kiyo'], [adminB, 'kenji'], [member, 'kiyo']]) {
    const reference = doc(collection(guest, 'messages'))
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'messages', reference.id), { character, text: 'delete test', createdAt: Timestamp.now() })
    })
    await assertSucceeds(deleteDoc(doc(db, 'messages', reference.id)))
    assert.equal((await getDoc(reference)).exists(), false)
  }
  await assertFails(getDocs(collection(guest, 'messages')))
  await assertFails(getDocs(query(collection(guest, 'messages'), limit(31))))
  const publicSync = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { unsubscribe(); reject(new Error('message sync timeout')) }, 10000)
    const unsubscribe = onSnapshot(latest(guest), snapshot => {
      if (snapshot.docs.some(item => item.data().text === '실시간 테스트')) { clearTimeout(timeout); unsubscribe(); resolve() }
    }, error => { clearTimeout(timeout); reject(error) })
  })
  await assertSucceeds(post(adminB, 'kiyo', { text: '실시간 테스트' }))
  await publicSync
  const publicDeleteSync = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { unsubscribe(); reject(new Error('message deletion sync timeout')) }, 10000)
    const unsubscribe = onSnapshot(latest(guest), snapshot => {
      if (!snapshot.docs.some(item => item.id === message.id)) { clearTimeout(timeout); unsubscribe(); resolve() }
    }, error => { clearTimeout(timeout); reject(error) })
  })
  await assertSucceeds(runTransaction(adminB, async transaction => {
    const target = doc(adminB, 'messages', message.id)
    await transaction.get(target)
    transaction.delete(target)
  }))
  await publicDeleteSync
  await environment.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'admins', 'admin-a'), { character: 'kiyo' })
    await updateDoc(doc(context.firestore(), 'admins', 'admin-b'), { enabled: false })
  })
  await assertFails(post(adminA, 'kenji'))
  await assertSucceeds(post(adminA, 'kiyo'))
  await assertFails(post(adminB, 'kiyo'))
  const remaining = (await getDocs(latest(guest))).docs[0]
  await assertFails(deleteDoc(doc(adminB, 'messages', remaining.id)))
  console.log('PASS: public messages, admin-only posts/deletion, cross-character deletion, live deletion sync, character binding, validation and revocation')
  console.log('PASS: public read, admin A/B publish, guest/member denial, input bounds, private UID roles, revocation, live sync, conflict and like counter rules')
} finally {
  await environment.cleanup()
}
