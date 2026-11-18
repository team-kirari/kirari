import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, Clapperboard, Dices, LockKeyhole, Pause, Pencil, Play, Plus, Trash2, Upload, X } from 'lucide-react'
import { deleteTrpgLog, editTrpgLog, listTrpgLogs, remoteLogs, saveTrpgLog, unlockTrpgLog } from '../lib/trpg-log-api'
import type { LogSummary } from '../lib/trpg-log-api'
import { groupLogEntries, logIdFromHash, parseTrpgLog, validateLogFile } from '../lib/trpg-logs'
import type { LogLine, ParsedLog } from '../lib/trpg-logs'
import { isStoryFont, storyFonts } from '../lib/stories'
import type { Story, StoryFont } from '../lib/stories'
import { useStoryFont } from '../lib/useStoryFont'
import TrpgRichText, { LogImage } from './TrpgRichText'
import TrpgScene from './TrpgScene'
import { MusicChannel } from './TrpgMusic'
import type { CinematicReplay } from '../lib/trpg-replay'
import type { RefObject } from 'react'
import { logImageDimensionsAllowed } from '../lib/trpg-media'
import './TrpgLogScreen.css'
import './StoryFonts.css'

const errorText = (error: unknown) => error instanceof Error ? error.message : '로그를 처리하지 못했어요.'
const PAGE_SIZE = 80
const lockedSummary = (id: string): LogSummary => ({ id, title: '잠긴 로그', editable: false, logDate: null, preview: null })

function LogPagination({ page, count, onPage }: { page: number, count: number, onPage: (page: number) => void }) {
  if (count <= 1) return null
  const pages = [...new Set([0, ...Array.from({ length: 5 }, (_, offset) => page + offset - 2), count - 1])].filter(value => value >= 0 && value < count).sort((a, b) => a - b)
  return <nav className="trpg-pagination" aria-label="로그 페이지">
    {pages.map((value, index) => <span className="trpg-page-item" key={value}>
      {index > 0 && value > pages[index - 1] + 1 && <span aria-hidden="true">…</span>}
      <button aria-label={`${value + 1}페이지`} aria-current={value === page ? 'page' : undefined} onClick={() => onPage(value)}>{value + 1}</button>
    </span>)}
  </nav>
}

function Dialogue({ entry, auto, speed, last, next, previous, first, replay, media, pending, advanceRef }: { entry: LogLine, auto: boolean, speed: number, last: boolean, next: () => void, previous: () => void, first: boolean, replay: CinematicReplay, media: boolean, pending: boolean, advanceRef: RefObject<(() => void) | null> }) {
  const characters = useMemo(() => Array.from(entry.sceneOnly ? '' : entry.text), [entry.sceneOnly, entry.text])
  const [shown, setShown] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [imageStatus, setImageStatus] = useState('loading')
  const textRef = useRef<HTMLDivElement>(null)
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const complete = entry.image && media ? imageStatus !== 'loading' : reduced || revealed || speed === 0 || shown >= characters.length
  useEffect(() => {
    if (complete) return
    const timer = window.setTimeout(() => setShown(value => Math.min(characters.length, value + 1)), speed + (/[,.!?。！？]/.test(characters[shown - 1] ?? '') ? speed * 4 : 0))
    return () => window.clearTimeout(timer)
  }, [characters, speed, complete, shown])
  useEffect(() => { const element = textRef.current; if (element) element.scrollTop = element.scrollHeight }, [shown])
  useEffect(() => { advanceRef.current = () => complete || entry.image ? next() : setRevealed(true); return () => { advanceRef.current = null } }, [complete, entry.image, next, advanceRef])
  useEffect(() => {
    if ((!auto && !entry.sceneOnly) || !complete || last || pending) return
    let timer: number
    const advance = () => { if (document.hidden) timer = window.setTimeout(advance, 1000); else next() }
    timer = window.setTimeout(advance, entry.sceneOnly ? 450 : Math.min(12_000, 2000 + characters.length * 35))
    return () => window.clearTimeout(timer)
  }, [auto, complete, last, next, characters.length, pending, entry.sceneOnly])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.repeat || !['ArrowRight', ' ', 'Enter'].includes(event.key) || target.closest('input,select,audio,video') || event.key !== 'ArrowRight' && target.closest('button,a,summary')) return
      event.preventDefault(); if (complete || entry.image) next(); else setRevealed(true)
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [complete, next, entry.image])
  if (entry.sceneOnly) return null
  if (entry.image && media) return <div className="trpg-photo" role="button" tabIndex={0} onClick={next} aria-label="다음 장면">
    <img src={entry.image.src} alt={entry.image.alt} referrerPolicy="no-referrer" onLoad={event => { const valid = logImageDimensionsAllowed(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight); setImageStatus(valid ? 'ready' : 'error'); if (!valid) event.currentTarget.hidden = true }} onError={event => { event.currentTarget.hidden = true; setImageStatus('error') }} />
    <p role="status">{imageStatus === 'loading' ? '이미지 불러오는 중…' : imageStatus === 'error' ? '이미지를 불러오지 못했어요. 다음으로 넘겨 주세요.' : ''}</p>
  </div>
  return <div className={`trpg-dialogue ${entry.narration ? 'narration' : ''}`}>
    <button className="trpg-previous" disabled={first} onClick={previous} aria-label="이전 대사"><ChevronLeft size={19} /></button>
    <div role="button" tabIndex={0} className="trpg-dialogue-body" onClick={() => complete || reduced ? next() : setRevealed(true)} aria-label="대사 전체 표시 또는 다음 대사">
      {!entry.narration && <span className="trpg-speaker">{entry.speaker}</span>}
      <div className="trpg-dialogue-text" ref={textRef}><TrpgRichText content={entry.content} text={entry.text || '…'} assets={replay.assets} media={media} limit={complete ? Infinity : shown} /></div>
    </div>
  </div>
}

function Cinematic({ entries, index, setIndex, title, media, onClose, replay, onMusicHost }: { entries: LogLine[], index: number, setIndex: (index: number) => void, title: string, media: boolean, onClose: () => void, replay: CinematicReplay, onMusicHost: (host: HTMLDivElement | null) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const advanceRef = useRef<(() => void) | null>(null)
  const [auto, setAuto] = useState(false)
  const [speed, setSpeed] = useState(24)
  const [pending, setPending] = useState(false)
  const next = useCallback(() => setIndex(Math.min(entries.length - 1, index + 1)), [entries.length, index, setIndex])
  let previousIndex = index - 1
  while (previousIndex >= 0 && entries[previousIndex].sceneOnly) previousIndex--
  const previous = useCallback(() => { if (previousIndex >= 0) setIndex(previousIndex) }, [previousIndex, setIndex])
  useEffect(() => {
    const element = dialog.current!
    const overflow = document.body.style.overflow
    element.showModal()
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = overflow }
  }, [])
  const entry = entries[index]
  return <dialog className="trpg-cinema" ref={dialog} aria-label={`${title} 시네마틱 보기`} onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => {
    if ((event.target as HTMLElement).closest('select,input')) return

    if (event.key === 'ArrowLeft') { event.preventDefault(); previous() }
  }}>
    {media && entry.scene && <TrpgScene scene={entry.scene} replay={replay} onPendingChange={setPending} onAdvance={() => advanceRef.current?.()} />}
    <header className="trpg-cinema-header">
      <span><Dices size={18} />{title}</span>
      <div className="trpg-cinema-controls">
        <div className="trpg-cinema-bgm" ref={onMusicHost} />
        <button aria-pressed={auto} onClick={() => setAuto(value => !value)}>{auto ? <Pause size={16} /> : <Play size={16} />}{auto ? '일시정지' : '자동 재생'}</button>
        <label>대사 속도 <select value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value={0}>즉시</option><option value={12}>빠르게</option><option value={24}>보통</option><option value={48}>천천히</option></select></label>
      </div>
      <button autoFocus onClick={onClose} aria-label="시네마틱 닫고 로그로 돌아가기"><X size={22} /></button>
    </header>
    <div className="trpg-cinema-stage">
      <div className="trpg-dialogue-stack">
        {media && entry.portrait && !entry.narration && <LogImage key={entry.portrait} className="trpg-portrait" src={entry.portrait} alt={`${entry.speaker} 초상`} />}
        <Dialogue key={`${index}:${entry.id}`} advanceRef={advanceRef} replay={replay} media={media} pending={media && pending} entry={entry} auto={auto} speed={speed} last={index === entries.length - 1} next={next} previous={previous} first={previousIndex < 0} />
      </div>
    </div>
  </dialog>
}

function Transcript({ groups, replay, selected }: { groups: LogLine[][], replay: CinematicReplay, selected?: number }) {
  return <div className="trpg-transcript">{groups.map(group => {
    const entry = group[0]
    return <article key={entry.id} className={`${entry.narration ? 'narration' : ''} ${group.some(line => line.id === selected) ? 'selected' : ''}`}>
      {entry.portrait && !entry.narration && <button type="button" className="trpg-reader-portrait" aria-label={`${entry.speaker} 포트레이트 확대`}><LogImage src={entry.portrait} alt={entry.speaker} /></button>}
      <div className="trpg-line-content">
        {!entry.narration && <div className="trpg-line-heading"><strong>{entry.speaker}</strong><small>{entry.channel}</small></div>}
        {group.map(line => <div key={line.id} id={`trpg-line-${line.id}`} tabIndex={-1} data-log-id={line.id} className="trpg-line">
          <TrpgRichText content={line.content} text={line.text || '…'} assets={replay.assets} media />
        </div>)}
      </div>
    </article>
  })}</div>
}

function LogReader({ parsed, title }: { parsed: ParsedLog, title: string }) {
  const [font, setFont] = useState<StoryFont>('default')
  const fontStatus = useStoryFont(font)
  const [musicHost, setMusicHost] = useState<HTMLDivElement | null>(null)
  const readerRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState(0)
  const [cinematic, setCinematic] = useState(false)
  const [page, setPage] = useState(0)
  const entries = useMemo(() => parsed.entries.filter(entry => entry.visible), [parsed])
  const groups = useMemo(() => groupLogEntries(entries), [entries])
  const playback = useMemo(() => parsed.playback.filter(entry => entry.visible), [parsed])
  const index = Math.max(0, playback.findIndex(entry => entry.id === selected))
  const setIndex = useCallback((value: number) => { setSelected(playback[value].id) }, [playback])
  const close = useCallback(() => {
    setCinematic(false)
    let at = index
    while (at > 0 && playback[at].sceneOnly) at--
    const line = playback[at].sceneOnly ? entries[0] : entries.find(entry => entry.id === playback[at].sourceId)
    if (!line) return
    const readerIndex = groups.findIndex(group => group.some(entry => entry.id === line.id))
    setSelected(line.id)
    setPage(Math.floor(Math.max(0, readerIndex) / PAGE_SIZE))
    requestAnimationFrame(() => document.getElementById(`trpg-line-${line.id}`)?.focus({ preventScroll: false }))
  }, [entries, groups, index, playback])
  const topLine = useCallback(() => {
    const rows = Array.from(readerRef.current?.querySelectorAll<HTMLElement>('[data-log-id]') ?? [])
    const row = rows.find(row => row.getBoundingClientRect().bottom > 120 && row.getBoundingClientRect().top < window.innerHeight)
    return row ? Number(row.dataset.logId) : groups[page * PAGE_SIZE]?.[0].id ?? 0
  }, [groups, page])
  useEffect(() => {
    if (cinematic) return
    let frame = 0
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setSelected(topLine())) }
    document.addEventListener('scroll', update, { capture: true, passive: true })
    window.addEventListener('resize', update)
    update()
    return () => { cancelAnimationFrame(frame); document.removeEventListener('scroll', update, true); window.removeEventListener('resize', update) }
  }, [cinematic, topLine])
  const pageCount = Math.max(1, Math.ceil(groups.length / PAGE_SIZE))
  const changePage = (value: number) => {
    setPage(value)
    setSelected(groups[value * PAGE_SIZE]?.[0].id ?? 0)
    requestAnimationFrame(() => readerRef.current?.scrollIntoView({ block: 'start' }))
  }
  return <div className="trpg-reader" ref={readerRef} style={{ fontFamily: storyFonts[font].family }}>
    <div className="trpg-reader-tools">
      <div className="trpg-music-controls" role="group" aria-label="BGM">
        <MusicChannel compact channel={1} track={playback[index]?.scene?.bgm01} replay={parsed.replay} controlsHost={musicHost} />
        <MusicChannel compact channel={2} track={playback[index]?.scene?.bgm02} replay={parsed.replay} controlsHost={musicHost} />
      </div>
      <div className="trpg-reader-actions">
        <label className="trpg-font"><span className="sr-only">글씨체</span><select value={font} onChange={event => { if (isStoryFont(event.target.value)) setFont(event.target.value) }}>{Object.entries(storyFonts).map(([value, choice]) => <option key={value} value={value}>{choice.label}</option>)}</select></label>
        <button className="primary-button" disabled={!entries.length} onClick={() => { setSelected(groups[page * PAGE_SIZE]?.[0].id ?? 0); setCinematic(true) }}><Clapperboard size={16} /> 시네마틱 보기</button>
      </div>
    </div>
    {!entries.length && <p className="trpg-empty">표시할 대사가 없어요.</p>}
    {fontStatus && <p className="trpg-note" role="status">{fontStatus}</p>}
    <LogPagination page={page} count={pageCount} onPage={changePage} />
    <Transcript groups={groups.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)} replay={parsed.replay} selected={selected} />
    <LogPagination page={page} count={pageCount} onPage={changePage} />
    {cinematic && entries.length > 0 && <Cinematic title={title} entries={playback} replay={parsed.replay} onMusicHost={setMusicHost} index={index} setIndex={setIndex} media onClose={close} />}
  </div>
}

function LogEditor({ original, onSaved, onCancel }: { original?: Story, onSaved: (story: Story) => void, onCancel: () => void }) {
  const [title, setTitle] = useState(original?.title ?? '')
  const [body, setBody] = useState(original?.body ?? '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fileName, setFileName] = useState(original ? '저장한 시네마틱 파일' : '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const pending = useRef<{ fingerprint: string, id?: string, mutation: string } | null>(null)
  const uploadVersion = useRef(0)
  useEffect(() => () => { uploadVersion.current++ }, [])
  const preview = useMemo(() => { try { return body ? parseTrpgLog(body) : null } catch { return null } }, [body])
  return <form className="trpg-editor" onSubmit={async event => {
    event.preventDefault(); setError(''); if (reading || busy) return
    if (!title.trim() || !preview || !original && !password.trim() || password !== confirmPassword) { setError('제목·시네마틱 파일·비밀번호 확인을 완료해 주세요.'); return }
    const fingerprint = JSON.stringify([title, body, password])
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, id: original?.id ?? (remoteLogs ? crypto.randomUUID() : undefined), mutation: crypto.randomUUID() }
    setBusy(true)
    try { onSaved(await saveTrpgLog({ title: title.trim(), body, password: original && !password ? null : password, id: pending.current.id, revision: original?.revision, mutation: pending.current.mutation })) }
    catch (error) { setError(errorText(error)) }
    finally { setBusy(false) }
  }}>
    <h2>{original ? '로그 수정' : '시네마틱 로그 등록'}</h2>
    <p className="trpg-note">원본 대사의 날짜와 시작 장면 이미지가 비밀번호 없이 보이는 목록에 표시됩니다.</p>
    <label>제목<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} disabled={busy} /></label>
    <input ref={fileInput} hidden type="file" accept=".html,.htm,text/html" disabled={busy} onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
      const version = ++uploadVersion.current
      setError(''); setReading(true); setBody(''); setFileName(file.name)
      try {
        validateLogFile(file)
        const source = await file.text()
        parseTrpgLog(source)
        if (version !== uploadVersion.current) return
        setBody(source); setFileName(file.name)
        if (!title) setTitle(file.name.replace(/\.html?$/i, '').slice(0, 120))
      } catch (error) { if (version === uploadVersion.current) setError(errorText(error)) }
      finally { if (version === uploadVersion.current) setReading(false) }
    }} />
    {!preview && !reading && <button type="button" className="trpg-file" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={21} /><strong>시네마틱 HTML 불러오기</strong></button>}
    {reading ? <p role="status">파일을 확인하는 중…</p> : preview && <section className="trpg-upload-preview" aria-label="선택한 로그 미리보기">
      <header><div><h3>{fileName}</h3><span>미리보기 · {preview.entries.length.toLocaleString()}개 대사</span></div><button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>파일 변경</button></header>
      <Transcript groups={groupLogEntries(preview.entries.filter(entry => entry.visible).slice(0, 5))} replay={preview.replay} />
      {!preview.entries.some(entry => entry.visible) && <p>미리보기에 표시할 대사가 없어요.</p>}
    </section>}
    <div className="trpg-password-fields"><label>{original ? '새 비밀번호 (비워 두면 유지)' : '열람 비밀번호'}<input type="text" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} required={!original} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></label><label>비밀번호 확인<input type="text" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} required={Boolean(password)} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} disabled={busy} /></label></div>
    <p className="trpg-note">원본은 {remoteLogs ? 'GitHub private 저장소' : '이 기기의 private checkout'}에 저장됩니다. 비밀번호를 아는 사람은 열람할 수 있으며, 저장소 관리자는 원본에 접근할 수 있습니다. 브라우저에는 원문·비밀번호를 영구 저장하지 않습니다.</p>
    {error && <p role="alert">{error}</p>}
    <div className="trpg-actions"><button type="button" disabled={busy} onClick={onCancel}>취소</button><button className="primary-button" disabled={busy || reading || !preview}>{busy ? '저장 중…' : '저장'}</button></div>
  </form>
}

export function TrpgLogScreen({ admin }: { admin: boolean }) {
  const [items, setItems] = useState<LogSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState<LogSummary | null>(() => {
    const id = logIdFromHash(window.location.hash)
    return id ? lockedSummary(id) : null
  })
  const [password, setPassword] = useState('')
  const [opened, setOpened] = useState<Story | null>(null)
  const [editor, setEditor] = useState<{ original?: Story } | null>(null)
  const [busy, setBusy] = useState(false)
  const version = useRef(0)
  useEffect(() => {
    const sync = () => {
      const id = logIdFromHash(window.location.hash)
      if (!id) return
      version.current++; setOpened(null); setEditor(null); setPassword(''); setError(''); setStatus(''); setBusy(false)
      setSelected(lockedSummary(id))
    }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  useEffect(() => {
    let cancelled = false
    void listTrpgLogs(admin).then(value => { if (!cancelled) setItems(value) }).catch(error => { if (!cancelled) setError(errorText(error)) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [admin, reload])
  const parsed = useMemo(() => opened ? parseTrpgLog(opened.body) : null, [opened])
  const removeLog = async (item: LogSummary) => {
    if (!window.confirm(`“${item.title}” 로그를 삭제할까요? 목록과 본문에서 제거되며 Git 이력에는 남습니다.`)) return
    setBusy(true); setError(''); setStatus('')
    const current = ++version.current
    try {
      const original = await editTrpgLog(item.id)
      await deleteTrpgLog(item.id, original.revision)
      if (current === version.current) {
        setItems(items => items.filter(value => value.id !== item.id))
        setStatus('로그를 삭제했어요.')
      }
    } catch (error) { if (current === version.current) setError(errorText(error)) }
    finally { if (current === version.current) setBusy(false) }
  }
  const back = () => { version.current++; setSelected(null); setOpened(null); setEditor(null); setPassword(''); setError(''); setBusy(false) }
  if (editor && admin) return <LogEditor key={editor.original?.id ?? 'new'} original={editor.original} onCancel={back} onSaved={story => { setEditor(null); setOpened(story); setSelected({ id: story.id, title: story.title, editable: true, logDate: null, preview: null }); setStatus(remoteLogs ? 'GitHub private 저장소에 저장했어요.' : '이 기기의 private checkout에 저장했어요.'); setReload(value => value + 1) }} />
  return <div className="trpg-screen" aria-busy={loading || busy}>
    {(selected || opened) ? <button className="back-link" onClick={back}><ArrowLeft size={15} />로그 목록 · 열람 닫기</button> : admin && <div className="trpg-list-tools"><button className="primary-button" onClick={() => { setError(''); setEditor({}) }}><Plus size={16} />로그 등록</button></div>}
    {!remoteLogs && <p className="trpg-note">로컬 모드 · 이 기기에만 저장됩니다.</p>}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error}</p>}
    {opened && parsed ? <><h2 className="trpg-reader-title">{opened.title}</h2><LogReader key={opened.id + ':' + opened.revision} title={opened.title} parsed={parsed} /></> : selected ? <form className="trpg-unlock" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(''); const current = ++version.current
      try { const story = await unlockTrpgLog(selected.id, password); if (current === version.current) { setOpened(story); setPassword('') } }
      catch (error) { if (current === version.current) setError(errorText(error)) }
      finally { if (current === version.current) setBusy(false) }
    }}><LockKeyhole size={32} /><h2>{selected.title === '잠긴 로그' ? '로그 열기' : selected.title}</h2><label>열람 비밀번호<input autoFocus required type="text" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></label><button className="primary-button" disabled={busy}>{busy ? '확인 중…' : '로그 열기'}</button></form> : <>
      {loading ? <div className="trpg-loading" role="status"><span className="trpg-loading-ring" aria-hidden="true" /><span>로그를 불러오는 중…</span></div> : <div className="trpg-log-list">{items.map(item => <article key={item.id}><button className="trpg-log-card" disabled={busy} onClick={() => { version.current++; setSelected(item); setPassword(''); setError(''); setStatus('') }}><span className="trpg-log-thumbnail">{item.preview ? <><LogImage key={item.preview} src={item.preview} alt="시작 장면 미리보기" /><small hidden>미리보기 없음</small></> : <small>미리보기 없음</small>}</span><span className="trpg-log-info"><strong>{item.title}</strong>{item.logDate ? <time dateTime={item.logDate}>{item.logDate.replaceAll('-', '.')}</time> : <small>날짜 정보 없음</small>}</span></button>{admin && item.editable && <div className="trpg-card-actions"><button className="trpg-edit-button" disabled={busy} onClick={async () => { setBusy(true); setError(''); const current = ++version.current; try { const original = await editTrpgLog(item.id); if (current === version.current) setEditor({ original }) } catch (error) { if (current === version.current) setError(errorText(error)) } finally { if (current === version.current) setBusy(false) } }}><Pencil size={12} />수정</button><button className="trpg-delete-button" disabled={busy} onClick={() => void removeLog(item)}><Trash2 size={12} />삭제</button></div>}</article>)}</div>}
      {!loading && !error && !items.length && <div className="trpg-empty"><Dices size={42} strokeWidth={1} /><h2>아직 등록된 글이 없어요</h2></div>}
    </>}
  </div>
}
