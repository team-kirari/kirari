import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowLeft, LockKeyhole, Pencil, Plus } from 'lucide-react'
import { compareStories, isStoryDate, isStoryFont, parseStoryDraft, storyDate, STORY_DEFAULT_FONT_SIZE, storyBlocks, storyFonts, storySizePresets, storyPresetSize } from '../lib/stories'
import type { Story, StoryDraft, StoryFont, StorySummary } from '../lib/stories'
import { useStoryFont } from '../lib/useStoryFont'
import { useConfirmation } from '../lib/useConfirmation'
import './StoryFonts.css'
import './StoryScreen.css'
import { getFirebaseConfig } from '../lib/auth'
import { emptyStoryBackups, readStoryBackups, storyDraftKey, writeStoryBackups } from '../lib/story-drafts'
import type { StoryDraftBackup, StoryDraftBackups } from '../lib/story-drafts'
import { storyStatistics } from '../lib/story-statistics'

const remoteUrl = import.meta.env.VITE_STORY_API_URL as string | undefined
const remote = Boolean(remoteUrl)
function storyEndpoint() {
  if (!remoteUrl) {
    if (!import.meta.env.DEV) throw new Error('이야기 서버가 아직 연결되지 않았어요.')
    return `${import.meta.env.BASE_URL}__local/stories`
  }
  const url = new URL(remoteUrl)
  if (url.protocol !== 'https:' || !/^kirari-stories\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) || url.pathname !== '/stories' || url.search || url.hash || url.username || url.password || url.port) throw new Error('이야기 서버 주소를 확인해 주세요.')
  return url.href
}
async function request(path = '', body?: unknown, authenticated = false): Promise<unknown> {
  const endpoint = storyEndpoint()
  const headers: Record<string, string> = remote ? {} : { 'X-Kirari-Local': '1' }
  if (remote && authenticated) {
    const config = getFirebaseConfig(import.meta.env)
    if (!config) throw new Error('Firebase 연결을 확인해 주세요.')
    const { getFirebaseAuth } = await import('../lib/firebase')
    const auth = getFirebaseAuth(config)
    await auth.authStateReady()
    if (!auth.currentUser) throw new Error('관리자 로그인이 필요해요.')
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`
  }
  const response = await fetch(`${endpoint}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', redirect: 'error',
    signal: AbortSignal.timeout(remote ? 60_000 : 15_000),
  })
  const data: unknown = await response.json()
  if (!response.ok) throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '글을 불러오지 못했어요.')
  return data
}
function readStory(data: unknown): Story {
  if (!data || typeof data !== 'object') throw new Error('글의 형식을 확인해 주세요.')
  const item = data as Record<string, unknown>
  const draft = parseStoryDraft(item)
  if (!draft || typeof item.id !== 'string' || !/^[a-f0-9-]{36}$/.test(item.id)
    || typeof item.revision !== 'number' || !Number.isSafeInteger(item.revision) || item.revision < 1
    || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt))
    || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))
    || typeof item.protected !== 'boolean') throw new Error('글의 형식을 확인해 주세요.')
  return { ...draft, id: item.id, revision: item.revision, createdAt: item.createdAt, updatedAt: item.updatedAt, protected: item.protected, editable: item.editable === true }
}
const formatDate = (date: string) => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' }).format(new Date(date))
async function readList(admin = false): Promise<StorySummary[]> {
  const data = await request('', undefined, admin)
  if (!Array.isArray(data) || data.length > 1000 || data.some(item => !item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[a-f0-9-]{36}$/.test(item.id) || typeof item.title !== 'string' || item.title.length > 120 || typeof item.author !== 'string' || item.author.length > 60 || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt)) || (item.writtenOn !== undefined && !isStoryDate(item.writtenOn)) || (item.createdAt !== undefined && (typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)))) || typeof item.protected !== 'boolean')) throw new Error('이야기 목록의 형식을 확인해 주세요.')
  return data.map(item => ({ ...item, createdAt: item.createdAt ?? item.updatedAt })).sort(compareStories)
}

function StoryLoading() {
  return <div className="story-loading" role="status"><span className="story-loading-ring" aria-hidden="true" /><span>이야기를 불러오는 중…</span></div>
}

function StoryReader({ draft, writtenOn, preview = false }: { draft: StoryDraft, writtenOn?: string, preview?: boolean }) {
  const fontStatus = useStoryFont(draft.font)
  return <article className="story-reader" tabIndex={preview ? 0 : undefined} aria-label={preview ? '게시글 미리보기' : '이야기 본문'} style={{ '--story-font': storyFonts[draft.font].family } as CSSProperties}>
    <header className="story-title"><h2>{draft.title || '제목'}</h2>{draft.author && <p>w. {draft.author}</p>}{writtenOn && <time dateTime={writtenOn}>{formatDate(writtenOn)}</time>}</header>
    {fontStatus && <p className="story-font-status" role="status">{fontStatus}</p>}
    <div className="story-prose" style={{ fontSize: storyPresetSize(draft.fontSize) }}>{storyBlocks(draft.body).map((block, index) => block.kind === 'scene'
      ? <div className="story-scene-break" role="separator" aria-label="장면 전환" key={index}><span aria-hidden="true">＊ ＊ ＊</span></div>
      : <p key={index}>{block.text}</p>)}</div>
  </article>
}

function StoryEditor({ original, onSaved, onCancel }: { original?: Story, onSaved: (story: Story, backupWarning?: string) => void, onCancel: () => void }) {
  const { confirm, confirmation } = useConfirmation()
  const [initialDraft] = useState<StoryDraft>(() => original ? { title: original.title, author: original.author, body: original.body, font: original.font, fontSize: original.fontSize ?? STORY_DEFAULT_FONT_SIZE, writtenOn: storyDate(original) } : { title: '', author: '', body: '', font: 'default', fontSize: STORY_DEFAULT_FONT_SIZE, writtenOn: storyDate({ updatedAt: new Date().toISOString() }) })
  const backupKey = storyDraftKey(remote, original?.id)
  const revision = original?.revision ?? 0
  const [loadedBackups] = useState(() => {
    try { return { data: readStoryBackups(window.localStorage, backupKey), error: '' } }
    catch { return { data: emptyStoryBackups(), error: '브라우저 임시저장을 읽지 못했어요. 저장 설정을 확인하거나 임시저장을 초기화해 주세요.' } }
  })
  const restored = loadedBackups.data.auto?.revision === revision ? loadedBackups.data.auto : null
  const [backups, setBackups] = useState<StoryDraftBackups>(loadedBackups.data)
  const [draft, setDraft] = useState<StoryDraft>(restored?.draft ?? initialDraft)
  const statisticsBody = useDeferredValue(draft.body)
  const statistics = useMemo(() => storyStatistics(statisticsBody), [statisticsBody])
  const [protect, setProtect] = useState(restored?.protect ?? original?.protected ?? false)
  const [backupError, setBackupError] = useState(loadedBackups.error)
  const backupDialog = useRef<HTMLDialogElement>(null)
  const [backupStatus, setBackupStatus] = useState(restored ? '자동 임시저장한 글을 복원했어요.' : loadedBackups.data.auto ? '이전 버전의 자동 임시저장이 있어요. 슬롯 메뉴에서 불러올 수 있어요.' : '')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const fontStatus = useStoryFont(draft.font)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const newId = useRef(crypto.randomUUID())
  const retry = useRef({ payload: '', mutation: '' })
  const finished = useRef(false)
  const contentDirty = JSON.stringify(draft) !== JSON.stringify(initialDraft) || protect !== (original?.protected ?? false)
  const latest = useRef({ draft, protect, dirty: contentDirty || Boolean(restored) })
  const saveAuto = useCallback((draft: StoryDraft, protect: boolean) => {
    try {
      const current = readStoryBackups(window.localStorage, backupKey)
      const next = { ...current, auto: { draft, protect, revision, savedAt: new Date().toISOString() } }
      writeStoryBackups(window.localStorage, backupKey, next)
      setBackups(next); setBackupError(''); setBackupStatus('브라우저에 자동 임시저장했어요.')
      return true
    } catch { setBackupError('임시저장하지 못했어요. 브라우저 저장 공간과 저장 허용 설정을 확인해 주세요.'); return false }
  }, [backupKey, revision])
  useEffect(() => {
    const shouldSave = contentDirty || latest.current.dirty
    latest.current = { draft, protect, dirty: shouldSave }
    if (!shouldSave) return
    const timer = window.setTimeout(() => { if (!finished.current) saveAuto(draft, protect) }, 400)
    return () => window.clearTimeout(timer)
  }, [draft, protect, contentDirty, saveAuto])
  useEffect(() => {
    const flush = () => {
      const current = latest.current
      if (!finished.current && current.dirty) saveAuto(current.draft, current.protect)
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [saveAuto])
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft) || protect !== (original?.protected ?? false) || password.length > 0 || passwordConfirm.length > 0
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  function update(key: keyof StoryDraft, value: string) { setDraft(previous => ({ ...previous, [key]: value })) }
  function openBackups() {
    try { setBackups(readStoryBackups(window.localStorage, backupKey)); setBackupError('') }
    catch { setBackupError('브라우저 임시저장을 읽지 못했어요. 저장 설정을 확인하거나 임시저장을 초기화해 주세요.') }
    backupDialog.current?.showModal()
  }
  async function restoreBackup(backup: StoryDraftBackup) {
    if (dirty && !await confirm('현재 작성 내용을 선택한 임시저장 글로 바꿀까요?')) return
    latest.current = { draft: backup.draft, protect: backup.protect, dirty: true }
    setDraft(backup.draft); setProtect(backup.protect); setPassword(''); setPasswordConfirm('')
    setError(''); setBackupStatus('임시저장 글을 불러왔어요. 비밀번호는 다시 입력해 주세요.')
    backupDialog.current?.close()
  }
  async function changeSlot(index: number, remove = false) {
    if (!remove && backups.slots[index] && !await confirm(`슬롯 ${index + 1}을 현재 작성 내용으로 덮어쓸까요?`)) return
    try {
      const next = readStoryBackups(window.localStorage, backupKey)
      next.slots[index] = remove ? null : { draft, protect, revision, savedAt: new Date().toISOString() }
      writeStoryBackups(window.localStorage, backupKey, next)
      setBackups(next); setBackupError(''); setBackupStatus(`슬롯 ${index + 1}을 ${remove ? '삭제' : '임시저장'}했어요.`)
    } catch { setBackupError('슬롯을 변경하지 못했어요. 브라우저 저장 공간과 저장 설정을 확인해 주세요.') }
  }
  async function resetBackups() {
    if (!await confirm('현재 작성 내용과 이 글의 브라우저 임시저장·슬롯을 모두 초기화할까요?')) return
    try {
      window.localStorage.removeItem(backupKey)
      latest.current = { draft: initialDraft, protect: original?.protected ?? false, dirty: false }
      setBackups(emptyStoryBackups()); setDraft(initialDraft); setProtect(original?.protected ?? false)
      setPassword(''); setPasswordConfirm(''); setBackupError(''); setBackupStatus('임시저장을 초기화했어요.')
    } catch { setBackupError('임시저장을 삭제하지 못했어요. 브라우저 저장 설정을 확인해 주세요.') }
  }
  async function leaveEditor() {
    if ((contentDirty || latest.current.dirty) && !saveAuto(draft, protect) && !await confirm('임시저장에 실패했어요. 작성 내용이 사라질 수 있어요. 목록으로 돌아갈까요?')) return
    finished.current = true
    onCancel()
  }
  async function save() {
    if (pending.current) return
    if (!parseStoryDraft(draft)) { setError('제목·본문·작성 날짜를 확인해 주세요.'); return }
    if (protect && !original?.protected && !password) { setError('비밀번호를 입력해 주세요.'); return }
    if (protect && password !== passwordConfirm) { setError('비밀번호와 비밀번호 확인이 일치하지 않아요.'); return }
    pending.current = true
    setBusy(true); setError('')
    try {
      const payload = { ...draft, fontSize: storyPresetSize(draft.fontSize), ...(original ? { id: original.id, revision: original.revision } : remote ? { id: newId.current, revision: 0 } : {}), password: protect ? password || null : '' }
      const serialized = JSON.stringify(payload)
      if (retry.current.payload !== serialized) retry.current = { payload: serialized, mutation: crypto.randomUUID() }
      const result = readStory(await request('', { ...payload, ...(remote ? { mutation: retry.current.mutation } : {}) }, remote))
      finished.current = true
      let backupWarning = ''
      try {
        const current = readStoryBackups(window.localStorage, backupKey)
        writeStoryBackups(window.localStorage, backupKey, { ...current, auto: null })
      } catch { backupWarning = '브라우저 자동 임시저장은 삭제하지 못했어요. 다음에 편집 화면에서 임시저장을 초기화해 주세요.' }
      setPassword(''); setPasswordConfirm(''); onSaved(result, backupWarning)
    } catch (error) { setError(error instanceof Error ? error.message : '저장하지 못했어요. 입력 내용은 유지돼요.') }
    finally { pending.current = false; setBusy(false) }
  }
  return <div className="story-editor">
    {confirmation}
    <div className="story-toolbar"><button type="button" className="soft-button" disabled={busy} onClick={leaveEditor}><ArrowLeft size={14} /> 목록</button><div className="story-save-actions"><button type="button" className="soft-button" disabled={busy} aria-haspopup="dialog" aria-controls="story-drafts-popup" onClick={openBackups}>임시저장</button><button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? '저장 중…' : remote ? '저장' : '로컬에 저장'}</button></div></div>
    {!remote && <p className="story-local-note">로컬 private 저장소에 저장해요. GitHub 원격 반영에는 별도 commit·push가 필요해요.</p>}
    {backupError && <p className="story-feedback" role="alert">{backupError}</p>}
    <dialog ref={backupDialog} id="story-drafts-popup" className="story-drafts-dialog" aria-labelledby="story-drafts-title">
      <header className="story-drafts-heading"><h2 id="story-drafts-title">임시저장</h2><button type="button" className="soft-button" autoFocus onClick={() => backupDialog.current?.close()}>닫기</button></header>
      <p className="story-local-note">작성 내용은 같은 기기·브라우저에 자동 임시저장돼요. 비밀번호는 저장하지 않아요. 슬롯은 새 글과 각 글의 수정 화면별로 구분돼요.</p>
      <p className="story-feedback" role="status">{backupStatus || '입력을 멈추면 자동 임시저장해요.'}</p>
      {backupError && <p className="story-feedback" role="alert">{backupError}</p>}
        {backups.auto && <button type="button" className="soft-button" disabled={busy} onClick={() => restoreBackup(backups.auto!)}>자동저장 불러오기 · {new Date(backups.auto.savedAt).toLocaleString('ko-KR')}</button>}
        <div className="story-draft-slots">{backups.slots.map((slot, index) => <div className="story-draft-slot" key={index}>
          <strong>슬롯 {index + 1}</strong><p>{slot ? slot.draft.title || '제목 없는 글' : '비어 있음'}</p>
          {slot && <time dateTime={slot.savedAt}>{new Date(slot.savedAt).toLocaleString('ko-KR')}</time>}
          <div><button type="button" className="soft-button" disabled={busy} onClick={() => changeSlot(index)}>임시저장</button><button type="button" className="soft-button" disabled={busy || !slot} onClick={() => { if (slot) restoreBackup(slot) }}>불러오기</button><button type="button" className="soft-button" disabled={busy || !slot} onClick={() => changeSlot(index, true)}>삭제</button></div>
        </div>)}</div>
        <button type="button" className="soft-button" disabled={busy} onClick={resetBackups}>작성 내용·임시저장 초기화</button>
    </dialog>
    {error && <p className="story-feedback" role="alert">{error}</p>}
    <div className="story-editor-layout story-editor-split">
      <fieldset className="story-fields" disabled={busy}>
        <label>제목<input value={draft.title} maxLength={120} onChange={event => update('title', event.target.value)} /></label>
        <label>작가명<input value={draft.author} maxLength={60} onChange={event => update('author', event.target.value)} /></label>
        <label>작성 날짜<input type="date" min="0001-01-01" max="9999-12-31" required value={draft.writtenOn ?? ''} onChange={event => update('writtenOn', event.target.value)} /></label>
        <div className="story-font-fields">
          <label>본문 폰트<select value={draft.font} onChange={event => { if (isStoryFont(event.target.value)) update('font', event.target.value) }}>{Object.entries(storyFonts).map(([value, font]) => <option value={value} key={value}>{font.label}</option>)}</select></label>
          <label>글자 크기<select value={storyPresetSize(draft.fontSize)} onChange={event => { const fontSize = Number(event.target.value); if (storySizePresets.some(preset => preset.value === fontSize)) setDraft(previous => ({ ...previous, fontSize })) }}>{storySizePresets.map(size => <option value={size.value} key={size.value}>{size.label}</option>)}</select></label>
        </div>
        {fontStatus && <p className="story-font-status" role="status">{fontStatus}</p>}
        <label className="story-protect"><input type="checkbox" checked={protect} onChange={event => { setProtect(event.target.checked); setPassword(''); setPasswordConfirm('') }} /> 열람 비밀번호 설정</label>
        {protect && <div className="story-password-fields">
          <label>{original?.protected ? '새 비밀번호' : '비밀번호'}<input type="text" value={password} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={event => setPassword(event.target.value)} /></label>
          <label>비밀번호 확인<input type="text" value={passwordConfirm} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={event => setPasswordConfirm(event.target.value)} /></label>
          <small className="story-password-help">{original?.protected && '두 칸을 비워 두면 기존 비밀번호를 유지해요. '}한글을 포함해 글자 수 제한 없이 설정할 수 있어요. {remote ? '수정 권한은 글을 작성한 관리자에게 있어요.' : '수정 권한은 로컬 작성자에게 있어요.'}</small>
        </div>}
        <label>본문<textarea className="story-body-input" value={draft.body} style={{ fontFamily: storyFonts[draft.font].family, fontSize: storyPresetSize(draft.fontSize) }} onChange={event => update('body', event.target.value)} aria-describedby="story-scene-help story-statistics" /></label>
        <dl id="story-statistics" className="story-statistics" aria-label="본문 통계" aria-busy={statisticsBody !== draft.body}>
          {([
            ['공백 포함', `${statistics.withSpaces.toLocaleString()}자`],
            ['공백 제외', `${statistics.withoutSpaces.toLocaleString()}자`],
            ['단어 수', statistics.words.toLocaleString()],
            ['단락 수', statistics.paragraphs.toLocaleString()],
            ['문장 수', statistics.sentences.toLocaleString()],
          ] as const).map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
        </dl>
        <p id="story-scene-help" className="story-local-note">한 줄에 ***만 쓰면 미리보기와 본문에서 장면 전환으로 바뀌어요. 붙여넣기도 지원하며 원문은 그대로 편집할 수 있어요.</p>
      </fieldset>
      <StoryReader draft={draft} writtenOn={draft.writtenOn} preview />
    </div>
  </div>
}

function StoryPasswordDialog({ title, busy, error, onUnlock, onClose }: { title: string, busy: boolean, error: string, onUnlock: (password: string) => void, onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => { element?.close() }
  }, [])
  useEffect(() => { if (error && !busy) input.current?.focus() }, [error, busy])
  return <dialog ref={dialog} className="story-password-dialog" aria-labelledby="story-password-title" aria-describedby="story-password-description" onCancel={event => { if (busy) event.preventDefault() }} onClose={() => { if (!dialog.current?.open) onClose() }}>
    <h2 id="story-password-title">이야기 비밀번호</h2>
    <p id="story-password-description">{title}</p>
    <form className="story-unlock" aria-busy={busy} onSubmit={event => {
      event.preventDefault()
      if (busy) return
      const value = input.current?.value ?? ''
      if (input.current) input.current.value = ''
      onUnlock(value)
    }}>
      <label>비밀번호<input ref={input} type="text" autoComplete="off" autoCapitalize="off" spellCheck={false} required autoFocus disabled={busy} /></label>
      {error && <p className="story-feedback" role="alert">{error}</p>}
      <div className="story-password-actions"><button className="soft-button" type="button" disabled={busy} onClick={() => dialog.current?.close()}>취소</button><button className="primary-button" disabled={busy}>{busy ? '확인 중…' : '열기'}</button></div>
    </form>
  </dialog>
}

export function StoryScreen({ admin = false }: { admin?: boolean }) {
  const available = remote || import.meta.env.DEV
  const canWrite = remote ? admin : import.meta.env.DEV
  const canEdit = (story: Story | StorySummary) => canWrite && (!remote || story.editable === true)
  const [items, setItems] = useState<StorySummary[]>([])
  const [view, setView] = useState<{ kind: 'list' } | { kind: 'read', story: Story } | { kind: 'edit', story?: Story }>({ kind: 'list' })
  const [locked, setLocked] = useState<StorySummary | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [loading, setLoading] = useState(available)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [readerFont, setReaderFont] = useState<StoryFont | null>(null)
  const [readerSize, setReaderSize] = useState<number | null>(null)
  const load = useCallback(async () => {
    if (!available) return
    setLoading(true)
    try {
      setItems(await readList(admin)); setError('')
    } catch (error) { setError(error instanceof Error ? error.message : '목록을 불러오지 못했어요.') }
    finally { setLoading(false) }
  }, [admin, available])
  useEffect(() => {
    if (!available) return
    let active = true
    void readList(admin).then(data => { if (active) { setItems(data); setError('') } })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : '목록을 불러오지 못했어요.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [admin, available])
  async function open(item: StorySummary, editing = false) {
    if (pending.current) return
    if (item.protected && !editing) { setLocked(item); setError(''); return }
    pending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const story = readStory(await request(`/${item.id}${editing ? '/edit' : ''}`, undefined, remote && admin))
      setReaderFont(null); setReaderSize(null); setView(editing ? { kind: 'edit', story } : { kind: 'read', story })
    } catch (error) { setError(error instanceof Error ? error.message : '글을 불러오지 못했어요.') }
    finally { pending.current = false; setBusy(false) }
  }
  async function unlock(value: string) {
    if (!locked || pending.current) return
    pending.current = true; setBusy(true); setError('')
    try {
      const story = readStory(await request(`/${locked.id}/unlock`, { password: value }, remote && admin))
      setReaderFont(null); setReaderSize(null); setLocked(null); setView({ kind: 'read', story })
    } catch { setError('글을 열 수 없어요. 비밀번호를 확인하거나 잠시 후 다시 시도해 주세요.') }
    finally { pending.current = false; setBusy(false) }
  }
  if (view.kind === 'edit') {
    if (!canWrite) return <p role="status">관리자로 다시 로그인해 주세요.<button type="button" onClick={() => setView({ kind: 'list' })}>목록</button></p>
    return <StoryEditor original={view.story} onCancel={() => { setView({ kind: 'list' }); void load() }} onSaved={(story, backupWarning) => { setView({ kind: 'read', story }); setReaderFont(null); setReaderSize(null); setNotice(remote ? 'GitHub 원격 저장소에 저장했어요.' : '로컬 저장소에 저장했어요. GitHub 원격에는 아직 반영하지 않았어요.'); if (backupWarning) setNotice(previous => `${previous} ${backupWarning}`); void load() }} />
  }
  return <div className="stories" aria-busy={loading || busy}>
    {busy && <div className="story-loading-overlay"><StoryLoading /></div>}
    {view.kind === 'list' ? <>
      {canWrite && <div className="story-toolbar">{!remote && <p className="story-local-note">로컬 private 저장소</p>}<button type="button" className="primary-button" disabled={loading || busy} onClick={() => { setError(''); setView({ kind: 'edit' }) }}><Plus size={15} /> 새 글 쓰기</button></div>}
      {!available && <p className="story-feedback" role="status">이야기 서버가 아직 연결되지 않았어요.</p>}
      {loading && !items.length ? <StoryLoading /> : !loading && !items.length && !error && <div className="story-empty"><p>아직 아무것도 없어요</p></div>}
      {items.length > 0 && <div className="story-list">{items.map((item, index) => <article key={item.id} style={{ animationDelay: `${Math.min(index, 6) * 35}ms` }}><button className="story-list-open" disabled={busy} onClick={() => void open(item)}><span>{item.protected && <LockKeyhole size={14} />}<strong>{item.title}</strong></span><small>{item.author && `w. ${item.author} · `}{formatDate(storyDate(item))}</small></button>{canEdit(item) && <button className="soft-button" disabled={busy} aria-label={`${item.title} 수정`} onClick={() => void open(item, true)}><Pencil size={14} /> 수정</button>}</article>)}</div>}
    </> : <>
      <div className="story-toolbar"><button className="soft-button" onClick={() => { setView({ kind: 'list' }); setNotice(''); void load() }}><ArrowLeft size={14} /> 목록</button><div className="story-reader-controls"><label className="story-reader-font"><select aria-label="폰트" value={readerFont ?? view.story.font} onChange={event => { if (isStoryFont(event.target.value)) setReaderFont(event.target.value) }}>{Object.entries(storyFonts).map(([value, font]) => <option key={value} value={value}>{font.label}</option>)}</select></label><label className="story-reader-font"><select aria-label="글자 크기" value={readerSize ?? storyPresetSize(view.story.fontSize)} onChange={event => { const size = Number(event.target.value); if (storySizePresets.some(preset => preset.value === size)) setReaderSize(size) }}>{storySizePresets.map(size => <option key={size.value} value={size.value}>{size.label}</option>)}</select></label></div>{canEdit(view.story) && <button className="soft-button" onClick={() => setView({ kind: 'edit', story: view.story })}><Pencil size={14} /> 수정</button>}</div>
      {notice && <p className="story-feedback" role="status">{notice}</p>}
      <StoryReader key={view.story.id} draft={{ ...view.story, font: readerFont ?? view.story.font, fontSize: readerSize ?? storyPresetSize(view.story.fontSize) }} writtenOn={storyDate(view.story)} />
    </>}
    {locked && <StoryPasswordDialog title={locked.title} busy={busy} error={error} onUnlock={value => void unlock(value)} onClose={() => { setLocked(null); setError('') }} />}
    {error && !locked && <p className="story-feedback" role="alert">{error}</p>}
    {error && view.kind === 'list' && !locked && <button className="soft-button" onClick={() => void load()}>다시 불러오기</button>}
  </div>
}
