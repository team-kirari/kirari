import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setLogLevel, Timestamp } from 'firebase/firestore'

setLogLevel('silent')
// Use online commits, as the app does, instead of the SDK's queued write stream.
const setDoc = (ref, data) => runTransaction(ref.firestore, async t => { t.set(ref, data) }, { maxAttempts: 1 })
const updateDoc = (ref, data) => runTransaction(ref.firestore, async t => { t.update(ref, data) }, { maxAttempts: 1 })
const deleteDoc = ref => runTransaction(ref.firestore, async t => { t.delete(ref) }, { maxAttempts: 1 })
const environment = await initializeTestEnvironment({ projectId: 'demo-kirari', firestore: {
  rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8088,
} })
const guest = environment.unauthenticatedContext().firestore()
const member = environment.authenticatedContext('member').firestore()
const admin = uid => environment.authenticatedContext(uid, { email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore()
const adminA = admin('admin-a'), adminB = admin('admin-b')
const gate = db => doc(db, 'guestbookState', 'posting')
const latest = db => query(collection(db, 'guestbook'), orderBy('createdAt', 'desc'), limit(30))
async function resetGate() {
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(gate(context.firestore()), { noteId: 'abcdefghijklmnopqrst', createdAt: Timestamp.fromMillis(1) })
  })
}
function post(db, extra = {}, reference = doc(collection(db, 'guestbook'))) {
  return runTransaction(db, async transaction => {
    await transaction.get(gate(db))
    transaction.set(reference, { text: 'hello', createdAt: serverTimestamp(), ...extra })
    transaction.set(gate(db), { noteId: reference.id, createdAt: serverTimestamp() })
  }, { maxAttempts: 1 })
}
function waitFor(predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new Error('guestbook live sync timeout')) }, 10000)
    const stop = onSnapshot(latest(guest), snapshot => {
      if (predicate(snapshot)) { clearTimeout(timer); stop(); resolve() }
    }, error => { clearTimeout(timer); reject(error) })
  })
}
try {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async context => {
    for (const uid of ['admin-a', 'admin-b']) await setDoc(doc(context.firestore(), 'admins', uid), { enabled: true })
  })
  const reference = doc(collection(guest, 'guestbook'))
  const liveCreate = waitFor(snapshot => snapshot.docs.some(item => item.id === reference.id))
  await assertSucceeds(post(guest, {}, reference))
  await liveCreate
  console.log('CHECK: public create and live sync')
  await assertSucceeds(getDoc(reference))
  await assertFails(post(guest)); console.log('CHECK: guest cooldown') // Shared server-side cooldown, including alternate clients.
  await assertFails(post(member)); console.log('CHECK: member cooldown')
  await assertFails(setDoc(doc(collection(guest, 'guestbook')), { text: 'bypass', createdAt: serverTimestamp() })); console.log('CHECK: bypass')
  await assertFails(runTransaction(guest, async t => { t.update(gate(guest), { createdAt: Timestamp.fromMillis(1) }) }, { maxAttempts: 1 })); console.log('CHECK: gate tamper')
  await assertFails(runTransaction(guest, async t => { t.delete(gate(guest)) }, { maxAttempts: 1 })); console.log('CHECK: gate delete')
  await assertFails(updateDoc(reference, { text: 'changed' }))
  await assertFails(deleteDoc(reference))
  await assertFails(deleteDoc(doc(member, 'guestbook', reference.id)))
  console.log('CHECK: cooldown and write/delete denial')
  for (const extra of [{ text: '' }, { text: ' \n\t ' }, { text: [] }, { text: 'x'.repeat(181) },
    { private: true }, { createdAt: Timestamp.fromMillis(1) }]) {
    await resetGate()
    await assertFails(post(guest, extra))
    console.log('CHECK: invalid input rejected', Object.keys(extra))
  }
  await resetGate()
  await assertFails(post(guest, {}, doc(guest, 'guestbook', 'invalid-id')))
  await assertFails(setDoc(gate(guest), { noteId: 'zzzzzzzzzzzzzzzzzzzz', createdAt: serverTimestamp() }))
  await assertFails(getDocs(collection(guest, 'guestbook')))
  await assertFails(getDocs(query(collection(guest, 'guestbook'), limit(31))))
  for (const text of ['x'.repeat(180), '<img src=x onerror=alert(1)> javascript:alert(1)']) {
    await resetGate()
    await assertSucceeds(post(guest, { text }))
  }
  console.log('CHECK: input validation')
  await resetGate()
  const racing = await Promise.allSettled([post(guest), post(member)])
  assert.equal(racing.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(racing.filter(result => result.status === 'rejected').length, 1)
  const liveDelete = waitFor(snapshot => !snapshot.docs.some(item => item.id === reference.id))
  await assertSucceeds(deleteDoc(doc(adminA, 'guestbook', reference.id)))
  await liveDelete
  const remaining = (await getDocs(latest(guest))).docs[0]
  await assertSucceeds(deleteDoc(doc(adminB, 'guestbook', remaining.id)))
  await environment.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'admins', 'admin-a'), { enabled: false })
  })
  const another = (await getDocs(latest(guest))).docs[0]
  await assertFails(deleteDoc(doc(adminA, 'guestbook', another.id)))
  console.log('PASS: guestbook public posting/read, validation, atomic throttle, racing writes, live create/delete, admin A/B deletion, member denial and revocation')
} finally {
  await environment.cleanup()
}
