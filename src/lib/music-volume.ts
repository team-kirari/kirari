export const MUSIC_VOLUME_KEY = 'kirari.music.volume'
export const DEFAULT_MUSIC_VOLUME = 40

export function readMusicVolume(storage: Pick<Storage, 'getItem'>): number {
  const saved = storage.getItem(MUSIC_VOLUME_KEY)
  if (saved === null) return DEFAULT_MUSIC_VOLUME
  if (!/^(?:100|[1-9]?\d)$/.test(saved)) throw new Error('Invalid saved volume')
  return Number(saved)
}

export function saveMusicVolume(storage: Pick<Storage, 'setItem'>, volume: number): void {
  if (!Number.isInteger(volume) || volume < 0 || volume > 100) throw new Error('Invalid volume')
  storage.setItem(MUSIC_VOLUME_KEY, String(volume))
}

export function resetMusicVolume(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(MUSIC_VOLUME_KEY)
}
