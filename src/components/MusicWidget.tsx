import { Flower2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { DEFAULT_MUSIC_VOLUME } from '../lib/music-volume'
import type { MusicPlayback } from '../lib/useMusicPlayback'

export function MusicWidget({ playback }: { playback: MusicPlayback }) {
  const { ready, playing, volume, storageError, error, track, changeVolume, previousTrack, nextTrack, togglePlayback } = playback
  return <section className="widget player music-connected" data-widget-id="player" aria-label="음악 위젯" tabIndex={0}>
    <div className="cd-player" aria-hidden="true">
      <div className="cd-disc"><div className="cd-label"><Flower2 size={24} /></div></div>
    </div>
    <div className="player-details"><div className="player-details-inner">
      <div className="music-track"><strong>{track?.title ?? '곡 정보를 불러오는 중…'}</strong>{track && <span>{track.artist}</span>}</div>
      <div className="player-controls" data-no-drag>
        <button aria-label="이전 곡" disabled={!ready} onClick={previousTrack}><SkipBack size={17} /></button>
        <button className="play" aria-label={playing ? '일시정지' : '음악 재생'} disabled={!ready} onClick={togglePlayback}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
        <button aria-label="다음 곡" disabled={!ready} onClick={nextTrack}><SkipForward size={17} /></button>
      </div>
      <div className="music-volume"><label htmlFor="music-volume">음량</label><input id="music-volume" type="range" min="0" max="100" value={volume} disabled={!ready} title="음량은 현재 브라우저에 저장됩니다." onChange={event => changeVolume(Number(event.target.value))} /><button type="button" className="music-volume-reset" aria-label="저장된 음량을 삭제하고 40%로 초기화" title="현재 브라우저에 저장된 음량 · 클릭하면 40%로 초기화" onClick={() => changeVolume(DEFAULT_MUSIC_VOLUME, true)}>{volume}%</button></div>
      {storageError && <p className="micro player-note" role="status">{storageError}</p>}
      {error && <p className="micro player-note" role="alert">{error}</p>}
    </div></div>
  </section>
}
