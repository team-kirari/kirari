import { collection, doc, getFirestore, limit, onSnapshot, query, runTransaction } from 'firebase/firestore'
import type { FirebaseOptions } from 'firebase/app'
import { getFirebaseApp } from './firebase-app'
import { parseTimelineEvent } from './timeline'
import type { TimelineEvent } from './timeline'

export function createTimelineStore(config: FirebaseOptions) {
  const database = getFirestore(getFirebaseApp(config))
  return {
    subscribe(next: (items: TimelineEvent[]) => void, fail: (error: unknown) => void) {
      return onSnapshot(query(collection(database, 'timeline'), limit(200)), { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return
        const items = snapshot.docs.map(item => parseTimelineEvent(item.id, item.data()))
        if (items.some(item => !item)) { fail({ code: 'invalid-data' }); return }
        next(items as TimelineEvent[])
      }, fail)
    },
    async save(item: TimelineEvent) {
      const { id, ...data } = item
      const payload = { ...data, revision: item.revision + 1 }
      if (!parseTimelineEvent(id, payload)) throw new Error('invalid-timeline')
      await runTransaction(database, async transaction => {
        const reference = doc(database, 'timeline', id)
        const snapshot = await transaction.get(reference)
        if ((snapshot.exists() ? snapshot.data().revision : 0) !== item.revision) throw new Error('timeline-conflict')
        transaction.set(reference, payload)
      })
    },
  }
}
