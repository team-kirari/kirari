import type { FirebaseOptions } from 'firebase/app'
import { collection, doc, getFirestore, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore'
import { getFirebaseApp } from './firebase-app'
import { getFirebaseAuth } from './firebase'
import { MESSAGE_LIMIT, messageText, parsePublicMessage } from './messages'
import type { MessageWriter, PublicMessage } from './messages'

export function createMessageStore(config: FirebaseOptions) {
  const database = getFirestore(getFirebaseApp(config))
  const messages = collection(database, 'messages')
  return {
    subscribe(next: (messages: PublicMessage[]) => void, fail: () => void) {
      return onSnapshot(query(messages, orderBy('createdAt', 'desc'), limit(MESSAGE_LIMIT)), { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return
        const parsed = snapshot.docs.map(item => {
          const data = item.data()
          return parsePublicMessage(item.id, { ...data, createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : null })
        })
        if (parsed.some(item => item === null)) { fail(); return }
        next((parsed as PublicMessage[]).reverse())
      }, fail)
    },
    async send(writer: MessageWriter, value: string) {
      const text = messageText(value)
      const auth = getFirebaseAuth(config)
      if (!text || auth.currentUser?.uid !== writer.uid) throw new Error('invalid-message-writer')
      const reference = doc(messages)
      // Transactions fail offline instead of queuing a public post for later.
      await runTransaction(database, async transaction => {
        transaction.set(reference, { character: writer.character, text, createdAt: serverTimestamp() })
      })
    },
    async remove(id: string) {
      if (typeof id !== 'string' || !/^[^/]{1,1500}$/.test(id) || id === '.' || id === '..'
        || !getFirebaseAuth(config).currentUser) throw new Error('invalid-message-delete')
      const reference = doc(messages, id)
      // Require an online transaction; do not queue a deletion for later.
      await runTransaction(database, async transaction => {
        const snapshot = await transaction.get(reference)
        if (snapshot.exists()) transaction.delete(reference)
      })
    },
  }
}
