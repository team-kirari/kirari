import { doc, getDoc, getFirestore, increment, setDoc } from 'firebase/firestore/lite'
import type { FirebaseOptions } from 'firebase/app'
import { getFirebaseApp } from './firebase-app'
import { parseLikeTotal } from './likes'

export function createLikeCounter(config: FirebaseOptions) {
  const reference = doc(getFirestore(getFirebaseApp(config)), 'counters', 'likes')
  // Share the initial request across React StrictMode mounts; no live listener or polling.
  let initial: Promise<number> | undefined
  return {
    read: () => initial ??= getDoc(reference)
      .then(snapshot => parseLikeTotal(snapshot.exists() ? snapshot.data() : undefined))
      .catch(error => { initial = undefined; throw error }),
    increment: async () => {
      await setDoc(reference, { total: increment(1) }, { merge: true })
      // Preserve successful clicks when navigating away and remounting the widget.
      if (initial) initial = initial.then(total => total + 1)
    },
  }
}
