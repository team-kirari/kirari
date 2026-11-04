import { doc, getFirestore, onSnapshot, runTransaction } from 'firebase/firestore'
import type { FirebaseOptions } from 'firebase/app'
import { getFirebaseApp } from './firebase-app'
import { defaultSettings, encodeSettings, parseSettings } from './site-settings'
import type { SiteSettings } from './site-settings'

export function createSettingsStore(config: FirebaseOptions) {
  const database = getFirestore(getFirebaseApp(config))
  const reference = doc(database, 'site', 'appearance')
  const layout = doc(database, 'site', 'layout')
  return {
    subscribe(next: (settings: SiteSettings) => void, fail: () => void) {
      const parts: Record<string, Record<string, unknown> | null | undefined> = {}
      const unsubscribes = [reference, layout].map(part => onSnapshot(part, { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return
        parts[part.id] = snapshot.exists() ? snapshot.data() : null
        const appearance = parts.appearance
        const positions = parts.layout
        if (appearance === undefined || positions === undefined) return
        if (appearance === null && positions === null) { next(defaultSettings); return }
        if (!appearance || !positions) { fail(); return }
        // The atomic write may reach the two listeners in separate callbacks.
        if (appearance.revision !== positions.revision) return
        const settings = parseSettings({ ...appearance, positions: positions.positions })
        if (settings) next(settings)
        else fail()
      }, fail))
      return () => unsubscribes.forEach(unsubscribe => unsubscribe())
    },
    async save(settings: SiteSettings) {
      const payload = encodeSettings({ ...settings, revision: settings.revision + 1 })
      if (!parseSettings(payload)) throw new Error('invalid-settings')
      await runTransaction(database, async transaction => {
        const snapshot = await transaction.get(reference)
        const layoutSnapshot = await transaction.get(layout)
        const current = snapshot.exists() && layoutSnapshot.exists()
          ? parseSettings({ ...snapshot.data(), positions: layoutSnapshot.data().positions })
          : !snapshot.exists() && !layoutSnapshot.exists() ? defaultSettings : null
        if (!current || current.revision !== settings.revision
          || (layoutSnapshot.exists() && layoutSnapshot.data().revision !== current.revision)) throw new Error('settings-conflict')
        const { positions, ...appearance } = payload
        transaction.set(reference, appearance)
        transaction.set(layout, { positions, revision: payload.revision })
      })
    },
  }
}
