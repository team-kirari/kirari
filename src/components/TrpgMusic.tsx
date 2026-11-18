'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { applyLogVolume, readLogVolume, resetLogVolume, saveLogVolume } from '../lib/trpg-volume';
import type { LogVolumePreference } from '../lib/trpg-volume';

import { youtubeVideoId, type CinematicReplay, type ReplayEvent } from '../lib/trpg-replay';

import { logMediaUrl as replayMediaSource } from '../lib/trpg-media';

type YouTubePlayer = {
  destroy: () => void; playVideo: () => void; pauseVideo: () => void;
  mute: () => void; unMute: () => void;
  setVolume: (value: number) => void; seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};
type YouTubeApi = {
  Player: new (host: HTMLElement, options: {
    width: string; height: string; videoId: string; playerVars: Record<string, string | number>;
    events: { onReady: () => void; onError: () => void; onAutoplayBlocked: () => void; onStateChange: (event: { data: number }) => void };
  }) => YouTubePlayer;
};
type YouTubeWindow = Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
let apiPromise: Promise<YouTubeApi> | undefined;
function youtubeApi(): Promise<YouTubeApi> {
  // The site's older music widget declares a narrower global YT constructor.
  const target = window as unknown as YouTubeWindow;
  if (target.YT?.Player) return Promise.resolve(target.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = target.onYouTubeIframeAPIReady;
    target.onYouTubeIframeAPIReady = () => { previous?.(); if (target.YT) resolve(target.YT); };
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    const script = existing ?? document.createElement('script');
    script.addEventListener('error', () => { apiPromise = undefined; script.remove(); reject(new Error('YouTube에 연결할 수 없습니다.')); }, { once: true });
    if (!existing) { script.src = 'https://www.youtube.com/iframe_api'; script.async = true; document.head.append(script); }
  });
  return apiPromise;
}
const recordedVolume = (track?: ReplayEvent) => {
  const volume = track?.volume;
  return typeof volume === 'number' && Number.isFinite(volume) ? Math.max(0, Math.min(100, volume <= 1 ? volume * 100 : volume)) : 50;
};





export function MusicChannel({ track, channel, replay, compact = false, enabled = true, controlsHost }: { track?: ReplayEvent; channel: number; replay: CinematicReplay; baseUrl?: string; compact?: boolean; enabled?: boolean; controlsHost?: HTMLDivElement | null }) {
  const [savedPreference] = useState(() => {
    try { return { ...readLogVolume(window.localStorage, channel), error: '' }; }
    catch { return { volume: null, muted: false, error: '저장된 음량을 읽을 수 없어 원본 음량을 사용해요.' }; }
  });
  const [volumeOverride, setVolumeOverride] = useState<number | null>(savedPreference.volume);
  const [muted, setMuted] = useState(savedPreference.muted);
  const [storageError, setStorageError] = useState(savedPreference.error);
  const [status, setStatus] = useState('');
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const wantsPlayback = useRef(true);
  const playingRef = useRef(false);
  const startupPending = useRef(true);
  const requestPlay = useRef<(() => void) | null>(null);
  const volume = muted ? 0 : volumeOverride ?? recordedVolume(track);
  const volumeRef = useRef(volume);
  const trackRef = useRef(track);
  const id = youtubeVideoId(track?.youtubeUrl ?? '');
  const audioSource = replayMediaSource(replay.assets[track?.audioAssetId ?? '']?.src || track?.audioUrl, replay.assets);
  // Reader pagination can reach another event for the same recording. Keep its
  // media instance (and playback position) until the actual source changes.
  const trackKey = track ? (audioSource ? `audio:${audioSource}` : `youtube:${id}`) : '';
  const controlsRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const playable = Boolean(track && (audioSource || id));

  useEffect(() => {
    if (!compact || !expanded) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !controlsRef.current?.contains(event.target)) setExpanded(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setExpanded(false);
      controlsRef.current?.querySelector<HTMLButtonElement>('[aria-controls]')?.focus();
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', keydown);
    };
  }, [compact, expanded]);

  useEffect(() => { volumeRef.current = volume; applyLogVolume(audioRef.current, playerRef.current, volume); }, [volume]);
  useEffect(() => { trackRef.current = track; }, [track]);

  useEffect(() => {
    let cancelled = false;
    let player: YouTubePlayer | null = null;
    const audio = audioRef.current;
    const host = hostRef.current;
    playingRef.current = false;
    startupPending.current = true;
    const reportPlaying = (value: boolean) => {
      if (cancelled) return;
      playingRef.current = value;
      if (value) startupPending.current = false;
      setPlaying(value);
    };
    queueMicrotask(() => reportPlaying(false));
    const blocked = () => {
      if (cancelled) return;
      setStatus('음악 재생 버튼을 눌러 주세요.');
    };
    const playAudio = () => {
      applyLogVolume(audio, null, volumeRef.current);
      void audio?.play().then(() => {
        if (cancelled) return;
        reportPlaying(true);
        setStatus('재생 중');
      }).catch(blocked);
    };
    // Retry only blocked startup playback, within the next user gesture.
    const retryBlocked = () => {
      if (!enabled || !wantsPlayback.current || !startupPending.current || playingRef.current) return;
      requestPlay.current?.();
    };
    requestPlay.current = () => {
      if (!enabled || !wantsPlayback.current) return;
      if (audioSource) playAudio();
      else { applyLogVolume(null, playerRef.current, volumeRef.current); playerRef.current?.playVideo(); }
    };
    // Click carries user activation for touch as well as mouse input.
    document.addEventListener('click', retryBlocked);
    document.addEventListener('keydown', retryBlocked);
    if (audio) {
      audio.pause();
      if (audioSource && enabled) {
        audio.currentTime = 0; audio.volume = volumeRef.current / 100;
        requestPlay.current();
      }
    }
    if (id && !audioSource && host && enabled) {
      void youtubeApi().then(api => {
        if (cancelled) return;
        const element = document.createElement('iframe');
        element.title = `BGM ${channel}: ${trackRef.current?.audioName || '배경 음악'}`;
        element.allow = 'autoplay; encrypted-media';
        element.src = `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=0&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`;
        host.replaceChildren(element);
        player = new api.Player(element, {
          width: '100%', height: '200', videoId: id,
          playerVars: { autoplay: 0, playsinline: 1, controls: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: () => { if (cancelled) return; playerRef.current = player; applyLogVolume(null, player, volumeRef.current); requestPlay.current?.(); setStatus(''); },
            onError: () => { if (!cancelled) setStatus('이 영상은 재생할 수 없습니다. YouTube 링크를 확인해 주세요.'); },
            onAutoplayBlocked: blocked,
            onStateChange: event => {
              if (cancelled) return;
              reportPlaying(event.data === 1);
              if (event.data === 1) { applyLogVolume(null, player, volumeRef.current); setStatus('재생 중'); }
              if (event.data === 0 && wantsPlayback.current && trackRef.current?.loop !== false) { player?.seekTo(0, true); player?.playVideo(); }
            },
          },
        });
      }).catch(() => { if (!cancelled) setStatus('YouTube에 연결할 수 없습니다. 링크를 직접 열어 주세요.'); });
    }
    return () => {
      cancelled = true;
      document.removeEventListener('click', retryBlocked);
      document.removeEventListener('keydown', retryBlocked);
      audio?.pause(); player?.destroy(); playerRef.current = null; host?.replaceChildren();
      requestPlay.current = null;
    };
  }, [trackKey, id, audioSource, enabled, channel]);

  const persistVolume = (value: LogVolumePreference) => {
    try { saveLogVolume(window.localStorage, channel, value); setStorageError(''); }
    catch { setStorageError('음량을 저장하지 못했어요. 현재 화면에만 적용됩니다.'); }
  };
  const changeVolume = (value: number) => {
    volumeRef.current = muted ? 0 : value;
    applyLogVolume(audioRef.current, playerRef.current, volumeRef.current);
    setVolumeOverride(value);
    persistVolume({ volume: value, muted });
  };
  const toggleMute = () => {
    const nextMuted = !muted;
    volumeRef.current = nextMuted ? 0 : volumeOverride ?? recordedVolume(track);
    applyLogVolume(audioRef.current, playerRef.current, volumeRef.current);
    setMuted(nextMuted);
    persistVolume({ volume: volumeOverride, muted: nextMuted });
  };
  const resetVolume = () => {
    try {
      resetLogVolume(window.localStorage, channel);
      volumeRef.current = recordedVolume(track);
      applyLogVolume(audioRef.current, playerRef.current, volumeRef.current);
      setVolumeOverride(null); setMuted(false); setStorageError('');
    } catch { setStorageError('저장된 음량을 초기화하지 못했어요.'); }
  };
  const resume = () => {
    wantsPlayback.current = true;
    requestPlay.current?.();
  };
  const media = <>
    {enabled && audioSource && <audio ref={audioRef} src={audioSource} loop={track?.loop !== false} preload="auto" className="w-full" onPlay={() => { playingRef.current = true; startupPending.current = false; setPlaying(true); }} onPause={() => { playingRef.current = false; setPlaying(false); }} onEnded={() => { playingRef.current = false; setPlaying(false); }} onError={() => setStatus('음악을 불러올 수 없습니다. 원본 주소를 확인해 주세요.')} />}
    {id && !audioSource && <div ref={hostRef} className="min-h-[12.5rem] w-full [&_iframe]:h-[12.5rem] [&_iframe]:w-full" />}
  </>;
  const muteButton = <button type="button" disabled={!playable} aria-label={`BGM ${channel} ${muted ? '음소거 해제' : '음소거'}`} aria-pressed={muted} onClick={toggleMute} className="shrink-0 rounded border border-[var(--pale)] p-2 disabled:opacity-40">
    {volume === 0 ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
  </button>;
  const resetButton = <button type="button" onClick={resetVolume} aria-label={`BGM ${channel} 저장된 음량 초기화`} title="저장된 음량 초기화" className="shrink-0 rounded border border-[var(--pale)] p-2"><RotateCcw size={16} aria-hidden="true" /></button>;
  const storageNotice = <p role="status" className="text-xs opacity-70">{storageError || '이 브라우저에 음량을 저장합니다.'}</p>;
  const fullControls = <section className="min-w-0 space-y-2 border-t border-white/15 py-3 text-sm">
    <p className="text-xs text-stone-400">BGM {channel}</p>
    <p className="break-words">{track?.audioName || (track ? '배경 음악' : '재생할 곡 없음')}</p>
    {track && <>
      <div className="flex flex-wrap items-center gap-2">
        {!playing && <button type="button" onClick={resume} className="rounded border border-white/20 px-2 py-1">음악 재생</button>}
        {muteButton}
        {resetButton}
        <label className="flex items-center gap-2"><input aria-label={`BGM ${channel} 볼륨`} type="range" min="0" max="100" value={volumeOverride ?? recordedVolume(track)} onChange={event => changeVolume(Number(event.target.value))} className="w-24" /></label>
      </div>
      {!compact && media}
      <p role="status" className="text-xs text-stone-400">{!audioSource && !id ? '이 곡에는 재생 주소가 연결되어 있지 않습니다.' : status}</p>
      {storageNotice}
      {id && <a href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer" className="text-xs underline">YouTube에서 열기</a>}
    </>}
  </section>;
  const compactControls = <div ref={controlsRef} className="trpg-music-channel relative min-w-0" onClick={event => event.stopPropagation()}>
    <button type="button" disabled={!enabled} onClick={() => setExpanded(value => !value)} aria-label={`BGM ${channel} 조절`} aria-expanded={expanded} aria-controls={panelId} title={track?.audioName || `BGM ${channel}`} className="inline-flex items-center gap-2 rounded border border-[var(--pale)] px-3 py-2 text-xs text-[var(--ink)] disabled:opacity-40">
      <span aria-hidden="true">{playing ? '♫' : '▶'}</span><span>BGM {channel}</span>
    </button>
    <div id={panelId} role="group" aria-label={`BGM ${channel} 조절`} inert={!expanded || !enabled}
      className={`${expanded && enabled ? 'visible' : 'invisible pointer-events-none'} trpg-music-panel absolute left-0 top-full z-40 mt-2 w-[min(18rem,65vw)] space-y-3 rounded-lg border border-[var(--pale)] bg-white p-4 text-sm text-[var(--ink)] shadow-lg`}>
      <p className="break-words text-xs text-[var(--ink)]">{track?.audioName || (track ? '배경 음악' : '재생할 곡 없음')}</p>
      <div className="flex items-center gap-3">
        {!playing && <button type="button" disabled={!playable} onClick={resume} aria-label={`BGM ${channel} 재생`} className="shrink-0 rounded border border-[var(--pale)] px-3 py-2 text-xs disabled:opacity-40">재생</button>}
        {muteButton}
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs">
          <input aria-label={`BGM ${channel} 볼륨`} type="range" min="0" max="100" disabled={!playable} value={volumeOverride ?? recordedVolume(track)} onChange={event => changeVolume(Number(event.target.value))} className="min-w-0 flex-1 accent-[var(--ink)]" />
          <span className="w-8 text-right tabular-nums">{volumeOverride ?? recordedVolume(track)}</span>
        </label>
        {resetButton}
      </div>
      {storageNotice}
    </div>
  </div>;
  if (compact) return <>
    {controlsHost ? createPortal(compactControls, controlsHost) : compactControls}
    <div inert className="invisible pointer-events-none absolute right-0 top-full w-[20rem]" aria-hidden="true">{media}</div>
    <span className="sr-only" role="status">{status}</span>
  </>;
  return fullControls;
}

