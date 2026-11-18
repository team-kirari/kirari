import { collection, doc, getFirestore, limit, onSnapshot, query, runTransaction } from 'firebase/firestore'
import type { FirebaseOptions } from 'firebase/app'
import { getFirebaseApp } from './firebase-app'
import { parseGalleryMetadata } from './gallery-catalog'
import type { GalleryMetadata } from './gallery-catalog'

export function createGalleryStore(config: FirebaseOptions) {
  const database = getFirestore(getFirebaseApp(config))
  return {
    subscribe(next: (items: Record<string, GalleryMetadata>) => void, fail: () => void) {
      return onSnapshot(query(collection(database, 'gallery'), limit(200)), { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return
        const items: Record<string, GalleryMetadata> = {}
        for (const document of snapshot.docs) {
          const value = parseGalleryMetadata(document.data())
          if (!/^[a-f0-9]{64}$/.test(document.id) || !value) { fail(); return }
          items[document.id] = value
        }
        next(items)
      }, fail)
    },
    async save(id: string, value: GalleryMetadata) {
      const payload = { ...value, revision: value.revision + 1 }
      if (!/^[a-f0-9]{64}$/.test(id) || !parseGalleryMetadata(payload)) throw new Error('invalid-gallery')
      await runTransaction(database, async transaction => {
        const reference = doc(database, 'gallery', id)
        const snapshot = await transaction.get(reference)
        if ((snapshot.exists() ? snapshot.data().revision : 0) !== value.revision) throw new Error('gallery-conflict')
        transaction.set(reference, payload)
      })
    },
  }
}
