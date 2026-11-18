import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, setDoc, setLogLevel, updateDoc } from 'firebase/firestore'
import { timelineFixture } from './fixtures/timeline.mjs'
import { defaultGalleryMetadata } from '../src/lib/gallery-catalog.ts'

setLogLevel('silent')
const environment = await initializeTestEnvironment({ projectId: 'demo-kirari-archive', firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8088 } })
const identity = (uid, verified = true, provider = 'google.com') => environment.authenticatedContext(uid, { email_verified: verified, firebase: { sign_in_provider: provider } }).firestore()
const guest = environment.unauthenticatedContext().firestore()
const adminA = identity('admin-a'), adminB = identity('admin-b'), memberA = identity('member-a'), memberB = identity('member-b')
const { id, ...seed } = timelineFixture
const timeline = { ...seed, revision: 1 }
const gallery = { ...defaultGalleryMetadata, tags: ['켄지', '키요'], revision: 1 }
try {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async context => {
    for (const uid of ['admin-a', 'admin-b', 'unverified', 'password']) await setDoc(doc(context.firestore(), 'admins', uid), { enabled: true })
  })
  for (const [name, key, payload] of [['timeline', id, timeline], ['gallery', 'a'.repeat(64), gallery]]) {
    const ref = database => doc(database, name, key)
    for (const database of [guest, memberA, memberB, identity('unverified', false), identity('password', true, 'password')]) {
      await assertFails(setDoc(ref(database), payload))
    }
    await assertSucceeds(setDoc(ref(adminA), payload))
    for (const database of [guest, memberA, memberB, adminA, adminB]) {
      assert.equal((await assertSucceeds(getDoc(ref(database)))).data().revision, 1)
      await assertSucceeds(getDocs(query(collection(database, name), limit(200))))
      await assertFails(getDocs(collection(database, name)))
      await assertFails(getDocs(query(collection(database, name), limit(201))))
    }
    await assertFails(updateDoc(ref(memberA), { deleted: true, revision: 2 }))
    await assertFails(updateDoc(ref(adminB), { revision: 1 }))
    await assertSucceeds(updateDoc(ref(adminB), { deleted: true, revision: 2 }))
    assert.equal((await getDoc(ref(guest))).data().deleted, true)
    await assertFails(deleteDoc(ref(adminA)))
    await assertFails(updateDoc(ref(adminA), { revision: 3, src: 'javascript:alert(1)' }))
  }
  for (const bad of [{ year: 0 }, { month: 13 }, { month: 2, day: 30 }, { year: 2050, month: 2, day: 29 }, { month: 4, day: 31 }, { title: ' ' }, { body: '' }, { deleted: 'true' }, { body: 'x'.repeat(12001) }]) {
    await assertFails(setDoc(doc(adminA, 'timeline', 'invalid'), { ...timeline, ...bad }))
  }
  await assertSucceeds(setDoc(doc(adminA, 'timeline', 'ordered'), { ...timeline, order: 0 }))
  await assertFails(updateDoc(doc(memberA, 'timeline', 'ordered'), { order: 1, revision: 2 }))
  await assertFails(updateDoc(doc(guest, 'timeline', 'ordered'), { order: 1, revision: 2 }))
  await assertSucceeds(updateDoc(doc(adminB, 'timeline', 'ordered'), { order: 1, revision: 2 }))
  for (const order of [-1, 1.5, '0', null, 1000000001]) await assertFails(setDoc(doc(adminA, 'timeline', 'bad-order'), { ...timeline, order }))
  await assertSucceeds(setDoc(doc(adminA, 'timeline', 'milestone'), { ...timeline, highlighted: true, subtitle: 'First meeting' }))
  assert.equal((await assertSucceeds(getDoc(doc(guest, 'timeline', 'milestone')))).data().subtitle, 'First meeting')
  for (const database of [guest, memberA, memberB]) await assertFails(updateDoc(doc(database, 'timeline', 'milestone'), { highlighted: false, revision: 2 }))
  await assertSucceeds(updateDoc(doc(adminB, 'timeline', 'milestone'), { highlighted: false, subtitle: '', revision: 2 }))
  for (const bad of [{ highlighted: 'true' }, { highlighted: null }, { subtitle: 42 }, { subtitle: null }, { subtitle: 'x'.repeat(41) }]) await assertFails(setDoc(doc(adminA, 'timeline', 'bad-milestone'), { ...timeline, ...bad }))
  await assertSucceeds(setDoc(doc(adminA, 'timeline', 'leap'), { ...timeline, year: 2048, month: 2, day: 29 }))
  for (const bad of [{ tags: ['a', 'a'] }, { tags: ['x'.repeat(41)] }, { tags: Array.from({ length: 21 }, (_, i) => String(i)) }, { tags: [42] }, { title: ' ' }, { credit: 'x'.repeat(121) }]) {
    await assertFails(setDoc(doc(adminA, 'gallery', 'b'.repeat(64)), { ...gallery, ...bad }))
  }
  await assertFails(setDoc(doc(adminA, 'gallery', 'bad-id'), gallery))
  console.log('Archive rules: guest/member/admin access, public reads, revisions, tombstones and input limits passed.')
} finally { await environment.cleanup() }
