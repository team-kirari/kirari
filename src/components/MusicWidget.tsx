import { useEffect, useRef, useState } from 'react'
import { Flower2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { loadYouTubeAPI, MUSIC_VIDEO_ID, musicPlayerVars, musicError, musicTrack, playMusic } from '../lib/youtube'
import type { YouTubePlayer } from '../lib/youtube'
import { DEFAULT_MUSIC_VOLUME, readMusicVolume, resetMusicVolume, saveMusicVolume } from '../lib/music-volume'

export function MusicWidget() {
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

  return <section className="widget player music-connected" data-widget-id="player" aria-label="음악 위젯" tabIndex={0}>
    <div className="cd-player" aria-hidden="true">
      <div className="cd-disc"><div className="cd-label"><Flower2 size={24} /></div></div>
    </div>
    <div className="youtube-player" ref={host} aria-hidden="true" />
    <div className="player-details"><div className="player-details-inner">
      <div className="music-track"><strong>{track?.title ?? '곡 정보를 불러오는 중…'}</strong>{track && <span>{track.artist}</span>}</div>
      <div className="player-controls" data-no-drag>
        <button aria-label="이전 곡" disabled={!ready} onClick={() => { setTrack(null); player.current?.previousVideo() }}><SkipBack size={17} /></button>
        <button className="play" aria-label={playing ? '일시정지' : '음악 재생'} disabled={!ready} onClick={() => { if (playing) player.current?.pauseVideo(); else if (player.current) playMusic(player.current, volume) }}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
        <button aria-label="다음 곡" disabled={!ready} onClick={() => { setTrack(null); player.current?.nextVideo() }}><SkipForward size={17} /></button>
      </div>
      <div className="music-volume"><label htmlFor="music-volume">음량</label><input id="music-volume" type="range" min="0" max="100" value={volume} disabled={!ready} title="음량은 현재 브라우저에 저장됩니다." onChange={event => changeVolume(Number(event.target.value))} /><button type="button" className="music-volume-reset" aria-label="저장된 음량을 삭제하고 40%로 초기화" title="현재 브라우저에 저장된 음량 · 클릭하면 40%로 초기화" onClick={() => changeVolume(DEFAULT_MUSIC_VOLUME, true)}>{volume}%</button></div>
      {storageError && <p className="micro player-note" role="status">{storageError}</p>}
      {error && <p className="micro player-note" role="alert">{error}</p>}
    </div></div>
  </section>
}
