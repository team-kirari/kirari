import type { FirebaseOptions } from 'firebase/app'
import { collection, doc, getFirestore, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore'
import { getFirebaseApp } from './firebase-app'
import { GUEST_LIMIT, guestText, parseGuestNote } from './guestbook'
import type { GuestNote } from './guestbook'

export function createGuestbookStore(config: FirebaseOptions) {
  const database = getFirestore(getFirebaseApp(config))
  const notes = collection(database, 'guestbook')
  const gate = doc(database, 'guestbookState', 'posting')
  return {
    subscribe(next: (items: GuestNote[]) => void, fail: () => void) {
      return onSnapshot(query(notes, orderBy('createdAt', 'desc'), limit(GUEST_LIMIT)), { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return
        const parsed = snapshot.docs.map(item => {
          const data = item.data()
          return parseGuestNote(item.id, { ...data, createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : null })
        })
        if (parsed.some(item => item === null)) { fail(); return }
        next(parsed as GuestNote[])
      }, fail)
    },
    async send(value: string) {
      const text = guestText(value)
      if (!text) throw new Error('invalid-guest-note')
      const reference = doc(notes)
      // Online-only, atomic post and shared throttle; rules use server time.
      await runTransaction(database, async transaction => {
        await transaction.get(gate)
        transaction.set(reference, { text, createdAt: serverTimestamp() })
        transaction.set(gate, { noteId: reference.id, createdAt: serverTimestamp() })
      })
    },
    async remove(id: string) {
      if (!/^[a-zA-Z0-9]{20}$/.test(id)) throw new Error('invalid-guest-note')
      await runTransaction(database, async transaction => {
        const reference = doc(notes, id)
        if ((await transaction.get(reference)).exists()) transaction.delete(reference)
      })
    },
  }
}
