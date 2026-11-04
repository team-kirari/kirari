export const MUSIC_VIDEO_ID = 'IFCDLIKSArs'
export const MUSIC_PLAYLIST_ID = 'PLWkyrpbKwvqA'
export const MUSIC_VIDEO_URL = `https://www.youtube.com/watch?v=${MUSIC_VIDEO_ID}&list=${MUSIC_PLAYLIST_ID}`

export interface YouTubePlayer {
  playVideo(): void
  pauseVideo(): void
  nextVideo(): void
  previousVideo(): void
  setLoop(value: boolean): void
  setShuffle(value: boolean): void
  setVolume(value: number): void
  unMute(): void
  cuePlaylist(options: { playlist: string[] }): void
  getCurrentTime(): number
  getDuration(): number
  getVideoData?(): unknown
  getPlaylist(): string[]
  getPlaylistIndex(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getIframe(): HTMLIFrameElement
  destroy(): void
}

type PlayerEvent = { target: YouTubePlayer, data: number }
interface YouTubeAPI {
  Player: new (element: HTMLElement, options: {
    width: number
    height: number
    videoId: string
    playerVars: ReturnType<typeof musicPlayerVars>
    events: {
      onReady(event: PlayerEvent): void
      onStateChange(event: PlayerEvent): void
      onError(event: PlayerEvent): void
      onAutoplayBlocked(): void
    }
  }) => YouTubePlayer
}

declare global {
  interface Window {
    YT?: YouTubeAPI
    onYouTubeIframeAPIReady?: () => void
  }
}

let pending: Promise<YouTubeAPI> | undefined

export function musicTrack(data: unknown): { title: string, artist: string } | null {
  if (!data || typeof data !== 'object') return null
  const { title, author } = data as Record<string, unknown>
  if (typeof title !== 'string' || !title.trim() || title.length > 500) return null
  const artist = typeof author === 'string' && author.trim() && author.length <= 200
    ? author.trim().replace(/ - Topic$/, '') : '아티스트 정보 없음'
  return { title: title.trim(), artist }
}

export function musicPlayerVars(origin: string) {
  return { listType: 'playlist', list: MUSIC_PLAYLIST_ID, playsinline: 1, rel: 0, origin, autoplay: 0, controls: 0 }
}

export function playMusic(player: YouTubePlayer, volume: number) {
  player.setVolume(Math.max(0, Math.min(100, Number.isFinite(volume) ? volume : 40)))
  player.unMute()
  player.playVideo()
}

export function loadYouTubeAPI(): Promise<YouTubeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (pending) return pending
  pending = new Promise<YouTubeAPI>((resolve, reject) => {
    const script = document.createElement('script')
    const previous = window.onYouTubeIframeAPIReady
    const cleanup = () => {
      window.clearTimeout(timeout)
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previous
      script.onerror = null
    }
    const fail = () => {
      cleanup()
      script.remove()
      pending = undefined
      reject(new Error('YouTube API could not be loaded'))
    }
    const ready = () => {
      if (!window.YT?.Player) { fail(); return }
      cleanup()
      resolve(window.YT)
      previous?.()
    }
    const timeout = window.setTimeout(fail, 15000)
    window.onYouTubeIframeAPIReady = ready
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = fail
    document.head.append(script)
  })
  return pending
}

export function musicEmbedURL(origin: string): string {
  const url = new URL(`https://www.youtube.com/embed/${MUSIC_VIDEO_ID}`)
  url.search = new URLSearchParams({ listType: 'playlist', list: MUSIC_PLAYLIST_ID, enablejsapi: '1', origin, autoplay: '0', loop: '1', playsinline: '1', controls: '0' }).toString()
  return url.href
}

export function musicError(code: number): string {
  const messages: Record<number, string> = {
    2: '재생 요청이 올바르지 않아요. 페이지를 새로고침해 주세요.',
    5: '브라우저에서 영상을 재생하지 못했어요. 페이지를 새로고침해 주세요.',
    100: '삭제되었거나 비공개인 영상이에요. 다음 곡을 선택해 주세요.',
    101: '외부 사이트에서 재생할 수 없는 영상이에요. 다음 곡을 선택해 주세요.',
    150: '외부 사이트에서 재생할 수 없는 영상이에요. 다음 곡을 선택해 주세요.',
    153: 'YouTube가 사이트 출처를 확인하지 못했어요. 브라우저의 리퍼러 차단 설정을 확인해 주세요.',
  }
  return `${messages[code] ?? '음악 재생에 실패했어요. 페이지를 새로고침해 주세요.'} (오류 ${code})`
}
