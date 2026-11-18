type AudioVolume = { volume: number, muted: boolean }
type PlayerVolume = { setVolume: (value: number) => void, mute: () => void, unMute: () => void }

export type LogVolumePreference = { volume: number | null, muted: boolean }
const preferenceKey = (channel: number) => {
  if (channel !== 1 && channel !== 2) throw new Error('Invalid BGM channel')
  return `kirari.trpg.bgm${channel}.volume`
}
function validPreference(value: unknown): value is LogVolumePreference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const data = value as Record<string, unknown>
  return typeof data.muted === 'boolean' && (data.volume === null
    || typeof data.volume === 'number' && Number.isFinite(data.volume) && data.volume >= 0 && data.volume <= 100)
}
export function readLogVolume(storage: Pick<Storage, 'getItem'>, channel: number): LogVolumePreference {
  const saved = storage.getItem(preferenceKey(channel))
  if (saved === null) return { volume: null, muted: false }
  if (saved.length > 100) throw new Error('Invalid saved BGM volume')
  const value: unknown = JSON.parse(saved)
  if (!validPreference(value)) throw new Error('Invalid saved BGM volume')
  return { volume: value.volume, muted: value.muted }
}
export function saveLogVolume(storage: Pick<Storage, 'setItem'>, channel: number, value: LogVolumePreference) {
  if (!validPreference(value)) throw new Error('Invalid BGM volume')
  storage.setItem(preferenceKey(channel), JSON.stringify({ volume: value.volume, muted: value.muted }))
}
export function resetLogVolume(storage: Pick<Storage, 'removeItem'>, channel: number) {
  storage.removeItem(preferenceKey(channel))
}

// Apply silence as an explicit mute, including before playback starts again.
export function applyLogVolume(audio: AudioVolume | null, player: PlayerVolume | null, volume: number) {
  const value = Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 0
  if (audio) { audio.volume = value / 100; audio.muted = value === 0 }
  if (player) {
    player.setVolume(value)
    if (value === 0) player.mute()
    else player.unMute()
  }
}
