// Replay event ordering and scene state adapted from AfterTheRoll. Uploaded scripts are never executed.
import { logMediaUrl } from './trpg-media.ts'
const replayMediaSource = logMediaUrl
/** Data-only adapter for cinematic-log-editor's portable replay format.
 * Never evaluate the script or import the editor's UI from an uploaded HTML.
 */
export type ReplayMessage = {
  id?: string | number;
  sourceMessageId?: string;
  timestamp?: string;
  speaker?: string;
  body?: string;
  tab?: string;
  portrait?: string;
  color?: string;
  content?: RichNode[];
  narration?: boolean;
};
export type RichNode = string | {
  tag?: string; text?: string; src?: string; alt?: string; title?: string;
  className?: string; color?: string; style?: Record<string, string>; children?: RichNode[];
};
export type FieldObject = {
  id: string; imageUrl: string; x: number; y: number; width: number; height: number;
  rotation: number; zIndex: number; kind?: string;
};
export type ReplayEvent = {
  id?: string; position: number; sequence: number;
  layer: 'background' | 'foreground' | 'fieldObjects' | 'bgm';
  channel?: string; status?: string; assetId?: string; imageSrc?: string; imageUrl?: string;
  imageSize?: { width: number; height: number } | null;
  bounds?: { x: number; y: number; width: number; height: number };
  objects?: FieldObject[];
  audioUrl?: string; audioAssetId?: string; youtubeUrl?: string; audioName?: string;
  volume?: number; loop?: boolean; inlineMessageId?: string | number;
};
export type CinematicReplay = {
  format: 'rollscene-studio-project-v1'; title?: string;
  sourceFormat?: 'roll20' | 'ccfolia' | 'cca';
  messages: ReplayMessage[]; events: ReplayEvent[];
  assets: Record<string, { src?: string }>;
  settings?: { cameraZoom?: number; showFieldObjects?: boolean; narrators?: string[] };
  tabVisibility?: Record<string, boolean>;
};
export type ReplaySceneState = {
  background: string; foreground: string; foregroundEvent?: ReplayEvent;
  fields?: ReplayEvent; bgm01?: ReplayEvent; bgm02?: ReplayEvent;
};
export type ReplayStep = {
  id: string; message?: ReplayMessage; messageIndex?: number;
  events: ReplayEvent[]; state: ReplaySceneState; label: string;
};
export function fieldFrame(event?: ReplayEvent) {
  const bounds = event?.bounds;
  if (!bounds || !Array.isArray(event?.objects) || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width < 0 || bounds.height < 0) return null;
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) };
}

export function replayMessageVisible(replay: CinematicReplay, message: ReplayMessage): boolean {
  const tab = String(message.tab || 'main');
  return replay.tabVisibility?.[tab] ?? !/^(잡담|ooc|out of character)$/i.test(tab);
}

// Match the editor's grouping: a repeated layer/channel is a distinct transition.
export function groupReplayEvents(events: ReplayEvent[]): ReplayEvent[][] {
  const groups: ReplayEvent[][] = [];
  let group: ReplayEvent[] = [], seen = new Set<string>();
  for (const event of events) {
    const key = event.layer === 'bgm' ? `bgm:${event.channel}` : event.layer;
    if (event.inlineMessageId || seen.has(key)) {
      if (group.length) groups.push(group);
      group = []; seen = new Set();
    }
    if (event.inlineMessageId) { groups.push([event]); continue; }
    group.push(event); seen.add(key);
  }
  if (group.length) groups.push(group);
  return groups;
}

export function compactFieldMotions(events: ReplayEvent[]): ReplayEvent[] {
  const omitted = new Set<number>();
  let run: number[] = [], signature = '', position = -1;
  const flush = () => { run.slice(1, -1).forEach(i => omitted.add(i)); run = []; signature = ''; };
  events.forEach((event, index) => {
    if (event.position !== position) { flush(); position = event.position; }
    if (event.layer !== 'fieldObjects') { if (event.layer !== 'bgm' || event.inlineMessageId) flush(); return; }
    if (!event.objects?.length) { flush(); return; }
    const objects = event.objects.map(object => ({ ...object, x: undefined, y: undefined, rotation: undefined })).sort((a, b) => a.id.localeCompare(b.id));
    const next = JSON.stringify({ bounds: event.bounds, objects });
    if (signature !== next) { flush(); signature = next; }
    run.push(index);
  });
  flush();
  return events.filter((_, index) => !omitted.has(index));
}

export function buildReplaySteps(replay: CinematicReplay): ReplayStep[] {
  const byPosition = new Map<number, ReplayEvent[]>();
  const events = compactFieldMotions([...replay.events].sort((a, b) => a.position - b.position || a.sequence - b.sequence));
  for (const event of events) {
    const at = Math.max(0, Math.min(replay.messages.length, Math.trunc(event.position)));
    byPosition.set(at, [...(byPosition.get(at) ?? []), event]);
  }
  const steps: ReplayStep[] = [];
  let state: ReplaySceneState = { background: '', foreground: '' };
  const add = (changes: ReplayEvent[], message?: ReplayMessage, messageIndex?: number) => {
    state = { ...state };
    for (const event of changes) {
      if (event.layer === 'background' || event.layer === 'foreground') {
        const hidden = event.status === 'clear' || event.imageUrl === 'ccfolia:none' || (event.layer === 'foreground' && event.imageSize && (!event.imageSize.width || !event.imageSize.height));
        state[event.layer] = hidden ? '' : replayMediaSource(replay.assets[event.assetId ?? '']?.src || event.imageSrc || event.imageUrl, replay.assets);
        if (event.layer === 'foreground') state.foregroundEvent = event;
      } else if (event.layer === 'fieldObjects') state.fields = event;
      else if (event.channel === 'bgm01' || event.channel === 'bgm02') state[event.channel] = ['stop', 'clear'].includes(event.status ?? '') ? undefined : event;
    }
    const labels = changes.map(e => e.layer === 'bgm' ? `${e.channel === 'bgm02' ? 'BGM 2' : 'BGM 1'} · ${['stop', 'clear'].includes(e.status ?? '') ? '중지' : e.audioName || '음악 변경'}` : e.layer === 'background' ? '배경 변경' : e.layer === 'foreground' ? '전경 변경' : `스크린·마커·figure 변경 · ${e.objects?.length ?? 0}개`);
    steps.push({ id: `replay-step-${steps.length}`, events: changes, state, message, messageIndex, label: labels.join(' / ') });
  };
  for (let position = 0; position <= replay.messages.length; position++) {
    const changes = byPosition.get(position) ?? [];
    const message = replay.messages[position];
    let boundary = changes.length;
    while (message && boundary > 0 && changes[boundary - 1].layer === 'bgm' && changes[boundary - 1].inlineMessageId && changes[boundary - 1].inlineMessageId === (message.sourceMessageId || message.id)) boundary--;
    for (const group of groupReplayEvents(changes.slice(0, boundary))) add(group);
    if (message) add(changes.slice(boundary), message, position);
  }
  return steps;
}

export function youtubeVideoId(value: string): string {
  try {
    const url = new URL(value), path = url.pathname.split('/').filter(Boolean);
    const id = url.hostname === 'youtu.be' ? path[0] : ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname) ? path[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'live', 'embed'].includes(path[0]) ? path[1] : '' : '';
    return /^[\w-]{11}$/.test(id ?? '') ? id! : '';
  } catch { return ''; }
}
