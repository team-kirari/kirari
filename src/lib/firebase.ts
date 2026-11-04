import { getFirebaseApp } from './firebase-app'
import type { FirebaseOptions } from 'firebase/app'
import { browserPopupRedirectResolver, browserSessionPersistence, GoogleAuthProvider, initializeAuth, onIdTokenChanged, signInWithPopup, signOut } from 'firebase/auth'
import type { Auth } from 'firebase/auth'
import { doc, getFirestore, onSnapshot } from 'firebase/firestore'
import { isActiveAdminRecord } from './auth'

let instance: Auth | undefined
export function getFirebaseAuth(config: FirebaseOptions): Auth {
  if (!instance) {
    const app = getFirebaseApp(config)
    // Restore sign-in on reload within this tab without using permanent storage.
    instance = initializeAuth(app, {
      persistence: browserSessionPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    })
  }
  return instance
}

export function loginWithGoogle(auth: Auth) {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return signInWithPopup(auth, provider)
}

export const observeIdentity = onIdTokenChanged
export const logout = signOut

export function observeAdminAccess(auth: Auth, uid: string, next: (admin: boolean) => void, fail: () => void) {
  return onSnapshot(doc(getFirestore(auth.app), 'admins', uid), { includeMetadataChanges: true }, snapshot => {
    // Only a server-confirmed membership may enable administrator controls.
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return
    next(snapshot.exists() && isActiveAdminRecord(snapshot.data()))
  }, fail)
}
