import { getFirebaseApp } from './firebase-app'
import type { FirebaseOptions } from 'firebase/app'
import { browserPopupRedirectResolver, GoogleAuthProvider, inMemoryPersistence, initializeAuth, onIdTokenChanged, signInWithPopup, signOut } from 'firebase/auth'
import type { Auth } from 'firebase/auth'

let instance: Auth | undefined
export function getFirebaseAuth(config: FirebaseOptions): Auth {
  if (!instance) {
    const app = getFirebaseApp(config)
    // Never persist authentication tokens in browser storage.
    instance = initializeAuth(app, {
      persistence: inMemoryPersistence,
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
