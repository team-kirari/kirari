import { useEffect, useRef, useState } from 'react'
import { loadYouTubeAPI, MUSIC_VIDEO_ID, musicPlayerVars, musicError, musicTrack, playMusic } from './youtube'
import type { YouTubePlayer } from './youtube'
import { DEFAULT_MUSIC_VOLUME, readMusicVolume, resetMusicVolume, saveMusicVolume } from './music-volume'

// Keep this hook and its host mounted above route-specific screens.
export function useMusicPlayback() {
  const host = useRef<HTMLDivElement>(null)
  const player = useRef<YouTubePlayer | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [savedVolume] = useState(() => {
    try { return { value: readMusicVolume(window.localStorage), error: '' } }
    catch { return { value: DEFAULT_MUSIC_VOLUME, error: '저장된 음량을 읽을 수 없어 기본 음량을 사용해요.' } }
  })
  const [volume, setVolume] = useState(savedVolume.value)
  const currentVolume = useRef(savedVolume.value)
  const [storageError, setStorageError] = useState(savedVolume.error)
  const [error, setError] = useState('')
  const [track, setTrack] = useState<{ title: string, artist: string } | null>({ title: 'Kirari', artist: 'Fujii Kaze' })

  useEffect(() => {
    let disposed = false
    let instance: YouTubePlayer | null = null
    const updateTrack = () => {
      if (!disposed && player.current) {
        const data = musicTrack(player.current.getVideoData?.())
        if (data) setTrack(current => current?.title === data.title && current.artist === data.artist ? current : data)
      }
    }
    const metadataTimer = window.setInterval(updateTrack, 1000)
    const timeout = window.setTimeout(() => {
      if (!disposed) setError('음악 연결이 지연되고 있어요. 잠시 후 페이지를 새로고침해 주세요.')
    }, 20000)
    void loadYouTubeAPI().then(api => {
      if (disposed || !host.current) return
      const mount = document.createElement('div')
      host.current.replaceChildren(mount)
      instance = new api.Player(mount, {
        width: 200,
        height: 200,
        videoId: MUSIC_VIDEO_ID,
        playerVars: musicPlayerVars(window.location.origin),
        events: {
          onReady: ({ target }) => {
            if (disposed) return
            player.current = target
            target.getIframe().title = 'kirari YouTube 음악'
            target.getIframe().referrerPolicy = 'strict-origin-when-cross-origin'
            target.getIframe().tabIndex = -1
            target.setVolume(currentVolume.current)
            target.unMute()
            window.clearTimeout(timeout)
            target.setLoop(true)
            setReady(true)
            updateTrack()
          },
          onStateChange: ({ target, data }) => {
            if (disposed) return
            setPlaying(data === 1)
            if (data === 5) target.setLoop(true)
            updateTrack()
            if (data === 1 || data === 5) setError('')
          },
          onAutoplayBlocked: () => {
            if (!disposed) { setPlaying(false); setError('재생 버튼을 다시 눌러 주세요.') }
          },
          onError: ({ data }) => {
            if (!disposed) { window.clearTimeout(timeout); setPlaying(false); setError(musicError(data)) }
          },
        },
      })
    }).catch(() => {
      if (!disposed) setError('음악에 연결하지 못했어요. 페이지를 새로고침해 주세요.')
    })
    return () => {
      disposed = true
      window.clearInterval(metadataTimer)
      window.clearTimeout(timeout)
      player.current = null
      instance?.destroy()
    }
  }, [])

  function changeVolume(value: number, reset = false) {
    currentVolume.current = value
    setVolume(value)
    player.current?.setVolume(value)
    if (value > 0) player.current?.unMute()
    try {
      if (reset) resetMusicVolume(window.localStorage)
      else saveMusicVolume(window.localStorage, value)
      setStorageError('')
    } catch {
      setStorageError('음량을 저장하지 못했어요. 현재 화면에만 적용됩니다.')
    }
  }

  return {
    host, ready, playing, volume, storageError, error, track, changeVolume,
    previousTrack() { setTrack(null); player.current?.previousVideo() },
    nextTrack() { setTrack(null); player.current?.nextVideo() },
    togglePlayback() {
      if (playing) player.current?.pauseVideo()
      else if (player.current) playMusic(player.current, volume)
    },
  }
}

export type MusicPlayback = Omit<ReturnType<typeof useMusicPlayback>, 'host'>
