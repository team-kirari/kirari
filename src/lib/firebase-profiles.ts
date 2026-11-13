import { doc, getFirestore, onSnapshot, runTransaction } from 'firebase/firestore'
import type { FirebaseOptions } from 'firebase/app'
import { getFirebaseApp } from './firebase-app'
import { parsePublishedProfile, validProfile, validPhotoSelection } from './profiles'
import type { CharacterProfile, PersonId, PhotoSelection, PublishedProfile } from './profiles'

export function createProfilesStore(config: FirebaseOptions) {
  const db = getFirestore(getFirebaseApp(config))
  return {
    subscribe(person: PersonId, next: (value: PublishedProfile | null) => void, fail: () => void) {
      return onSnapshot(doc(db, 'profiles', person), { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return
        if (!snapshot.exists()) { next(null); return }
        const value = parsePublishedProfile(snapshot.data())
        if (value) next(value)
        else fail()
      }, fail)
    },
    async save(person: PersonId, profile: CharacterProfile, photoSelection: PhotoSelection, revision: number) {
      if (!validProfile(profile) || !validPhotoSelection(photoSelection)) throw new Error('invalid-profile')
      const reference = doc(db, 'profiles', person)
      await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(reference)
        const current = snapshot.exists() ? parsePublishedProfile(snapshot.data()) : null
        if ((snapshot.exists() && !current) || (current?.revision ?? 0) !== revision) throw new Error('profile-conflict')
        transaction.set(reference, { profile, photoSelection, revision: revision + 1 })
      })
    },
  }
}
