import { getApp, getApps, initializeApp } from 'firebase/app'
import type { FirebaseOptions } from 'firebase/app'

export function getFirebaseApp(config: FirebaseOptions) {
  return getApps().some(app => app.name === 'kirari') ? getApp('kirari') : initializeApp(config, 'kirari')
}
