import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowLeft, LockKeyhole, Pencil, Plus } from 'lucide-react'
import { isStoryFont, parseStoryDraft, STORY_MAX_LENGTH, storyBlocks, storyFonts } from '../lib/stories'
import type { Story, StoryDraft, StoryFont, StorySummary } from '../lib/stories'
import { useStoryFont } from '../lib/useStoryFont'
import './StoryFonts.css'
import './StoryScreen.css'
import { getFirebaseConfig } from '../lib/auth'

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
  if (!Array.isArray(data) || data.length > 1000 || data.some(item => !item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[a-f0-9-]{36}$/.test(item.id) || typeof item.title !== 'string' || item.title.length > 120 || typeof item.author !== 'string' || item.author.length > 60 || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt)) || typeof item.protected !== 'boolean')) throw new Error('이야기 목록의 형식을 확인해 주세요.')
  return data
}

function StoryReader({ draft, updatedAt, preview = false }: { draft: StoryDraft, updatedAt?: string, preview?: boolean }) {
  const fontStatus = useStoryFont(draft.font)
  return <article className="story-reader" aria-label={preview ? '게시글 미리보기' : '이야기 본문'} style={{ '--story-font': storyFonts[draft.font].family } as CSSProperties}>
    <header className="story-title"><span>{preview ? '미리보기' : '이야기'}</span><h2>{draft.title || '제목'}</h2>{draft.author && <p>{draft.author}</p>}{updatedAt && <time dateTime={updatedAt}>{formatDate(updatedAt)}</time>}</header>
    {fontStatus && <p className="story-font-status" role="status">{fontStatus}</p>}
    <div className="story-prose">{storyBlocks(draft.body).map((block, index) => block.kind === 'scene'
      ? <div className="story-scene-break" role="separator" aria-label="장면 전환" key={index}><span aria-hidden="true">＊ ＊ ＊</span></div>
      : <p key={index}>{block.text}</p>)}</div>
  </article>
}

function StoryEditor({ original, onSaved, onCancel }: { original?: Story, onSaved: (story: Story) => void, onCancel: () => void }) {
  const [draft, setDraft] = useState<StoryDraft>(() => original ? { title: original.title, author: original.author, body: original.body, font: original.font } : { title: '', author: '', body: '', font: 'default' })
  const [protect, setProtect] = useState(original?.protected ?? false)
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'write' | 'preview' | 'split'>('write')
  const [busy, setBusy] = useState(false)
  const fontStatus = useStoryFont(draft.font)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const newId = useRef(crypto.randomUUID())
  const retry = useRef({ payload: '', mutation: '' })
  const dirty = JSON.stringify(draft) !== JSON.stringify(original ? { title: original.title, author: original.author, body: original.body, font: original.font } : { title: '', author: '', body: '', font: 'default' }) || protect !== (original?.protected ?? false) || password.length > 0
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  function update(key: keyof StoryDraft, value: string) { setDraft(previous => ({ ...previous, [key]: value })) }
  async function save() {
    if (pending.current) return
    if (!parseStoryDraft(draft)) { setError('제목과 본문을 입력해 주세요.'); return }
    if (protect && !(original?.protected && !password) && (password.length < 8 || password.length > 128)) { setError('비밀번호는 8~128자로 입력해 주세요.'); return }
    pending.current = true
    setBusy(true); setError('')
    try {
      const payload = { ...draft, ...(original ? { id: original.id, revision: original.revision } : remote ? { id: newId.current, revision: 0 } : {}), password: protect ? password || null : '' }
      const serialized = JSON.stringify(payload)
      if (retry.current.payload !== serialized) retry.current = { payload: serialized, mutation: crypto.randomUUID() }
      const result = readStory(await request('', { ...payload, ...(remote ? { mutation: retry.current.mutation } : {}) }, remote))
      setPassword(''); onSaved(result)
    } catch (error) { setError(error instanceof Error ? error.message : '저장하지 못했어요. 입력 내용은 유지돼요.') }
    finally { pending.current = false; setBusy(false) }
  }
  return <div className="story-editor">
    <div className="story-toolbar"><button type="button" className="soft-button" disabled={busy} onClick={() => { if (!dirty || window.confirm('저장하지 않은 내용을 버리고 목록으로 돌아갈까요?')) onCancel() }}><ArrowLeft size={14} /> 목록</button><div className="story-view-tabs" role="group" aria-label="편집 화면">{(['write', 'preview', 'split'] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{({ write: '작성', preview: '미리보기', split: '함께 보기' })[value]}</button>)}</div><button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? '저장 중…' : remote ? '저장' : '로컬에 저장'}</button></div>
    <p className="story-local-note">{remote ? '저장하면 GitHub 비공개 저장소에 바로 반영해요. 비밀번호 없는 글은 누구나 읽을 수 있어요. 보호된 글도 저장소 관리자에게는 원문이 보여요.' : '로컬 private 저장소에 저장해요. GitHub 원격 반영에는 별도 commit·push가 필요해요.'}</p>
    {error && <p className="story-feedback" role="alert">{error}</p>}
    <div className={`story-editor-layout story-editor-${mode}`}>
      {mode !== 'preview' && <fieldset className="story-fields" disabled={busy}>
        <label>제목<input value={draft.title} maxLength={120} onChange={event => update('title', event.target.value)} /></label>
        <label>작가명<input value={draft.author} maxLength={60} onChange={event => update('author', event.target.value)} /></label>
        <label>본문 폰트<select value={draft.font} onChange={event => { if (isStoryFont(event.target.value)) update('font', event.target.value) }}>{Object.entries(storyFonts).map(([value, font]) => <option value={value} key={value}>{font.label}</option>)}</select></label>
        {fontStatus && <p className="story-font-status" role="status">{fontStatus}</p>}
        <label className="story-protect"><input type="checkbox" checked={protect} onChange={event => { setProtect(event.target.checked); setPassword('') }} /> 열람 비밀번호 설정</label>
        {protect && <label>{original?.protected ? '새 비밀번호 (비워 두면 기존 비밀번호 유지)' : '비밀번호'}<input type="text" value={password} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={128} onChange={event => setPassword(event.target.value)} /><small>한글을 포함해 8~128자. {remote ? '수정 권한은 글을 작성한 관리자에게 있어요.' : '수정 권한은 로컬 작성자에게 있어요.'}</small></label>}
        <label>본문<textarea className="story-body-input" value={draft.body} maxLength={STORY_MAX_LENGTH} style={{ fontFamily: storyFonts[draft.font].family }} onChange={event => update('body', event.target.value)} aria-describedby="story-scene-help" /></label>
        <p id="story-scene-help" className="story-local-note">한 줄에 ***만 쓰면 미리보기와 본문에서 장면 전환으로 바뀌어요. 붙여넣기도 지원하며 원문은 그대로 편집할 수 있어요.</p>
        <small>{draft.body.length.toLocaleString()} / {STORY_MAX_LENGTH.toLocaleString()}자</small>
      </fieldset>}
      {mode !== 'write' && <StoryReader draft={draft} preview />}
    </div>
  </div>
}

export function StoryScreen({ admin = false }: { admin?: boolean }) {
  const available = remote || import.meta.env.DEV
  const canWrite = remote ? admin : import.meta.env.DEV
  const canEdit = (story: Story | StorySummary) => canWrite && (!remote || story.editable === true)
  const [items, setItems] = useState<StorySummary[]>([])
  const [view, setView] = useState<{ kind: 'list' } | { kind: 'read', story: Story } | { kind: 'edit', story?: Story }>({ kind: 'list' })
  const [locked, setLocked] = useState<StorySummary | null>(null)
  const password = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [loading, setLoading] = useState(available)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [readerFont, setReaderFont] = useState<StoryFont | null>(null)
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
      setReaderFont(null); setView(editing ? { kind: 'edit', story } : { kind: 'read', story })
    } catch (error) { setError(error instanceof Error ? error.message : '글을 불러오지 못했어요.') }
    finally { pending.current = false; setBusy(false) }
  }
  async function unlock() {
    if (!locked || pending.current) return
    const value = password.current?.value ?? ''
    if (password.current) password.current.value = ''
    pending.current = true; setBusy(true); setError('')
    try {
      const story = readStory(await request(`/${locked.id}/unlock`, { password: value }, remote && admin))
      setReaderFont(null); setLocked(null); setView({ kind: 'read', story })
    } catch { setError('글을 열 수 없어요. 비밀번호를 확인하거나 잠시 후 다시 시도해 주세요.') }
    finally { pending.current = false; setBusy(false) }
  }
  if (view.kind === 'edit') {
    if (!canWrite) return <p role="status">관리자로 다시 로그인해 주세요.<button type="button" onClick={() => setView({ kind: 'list' })}>목록</button></p>
    return <StoryEditor original={view.story} onCancel={() => { setView({ kind: 'list' }); void load() }} onSaved={story => { setView({ kind: 'read', story }); setReaderFont(null); setNotice(remote ? 'GitHub 원격 저장소에 저장했어요.' : '로컬 저장소에 저장했어요. GitHub 원격에는 아직 반영하지 않았어요.'); void load() }} />
  }
  return <div className="stories">
    {view.kind === 'list' ? <>
      {canWrite && <div className="story-toolbar"><p className="story-local-note">{remote ? 'GitHub 원격 저장소' : '로컬 private 저장소'}</p><button type="button" className="primary-button" disabled={loading || busy} onClick={() => { setError(''); setView({ kind: 'edit' }) }}><Plus size={15} /> 새 글 쓰기</button></div>}
      {!available && <p className="story-feedback" role="status">이야기 서버가 아직 연결되지 않았어요.</p>}
      {loading ? <p className="story-feedback" role="status">이야기를 불러오는 중…</p> : !items.length && !error && <div className="story-empty"><p>아직 아무것도 없어요</p></div>}
      <div className="story-list">{items.map(item => <article key={item.id}><button className="story-list-open" disabled={busy} onClick={() => void open(item)}><span>{item.protected && <LockKeyhole size={14} />}<strong>{item.title}</strong></span><small>{item.author && `${item.author} · `}{formatDate(item.updatedAt)}</small></button>{canEdit(item) && <button className="soft-button" disabled={busy} aria-label={`${item.title} 수정`} onClick={() => void open(item, true)}><Pencil size={14} /> 수정</button>}</article>)}</div>
    </> : <>
      <div className="story-toolbar"><button className="soft-button" onClick={() => { setView({ kind: 'list' }); setNotice(''); void load() }}><ArrowLeft size={14} /> 목록</button><label className="story-reader-font">폰트<select value={readerFont ?? view.story.font} onChange={event => { if (isStoryFont(event.target.value)) setReaderFont(event.target.value) }}>{Object.entries(storyFonts).map(([value, font]) => <option key={value} value={value}>{font.label}</option>)}</select></label>{canEdit(view.story) && <button className="soft-button" onClick={() => setView({ kind: 'edit', story: view.story })}><Pencil size={14} /> 수정</button>}</div>
      {notice && <p className="story-feedback" role="status">{notice}</p>}
      <StoryReader draft={{ ...view.story, font: readerFont ?? view.story.font }} updatedAt={view.story.updatedAt} />
    </>}
    {locked && <form className="story-unlock" onSubmit={event => { event.preventDefault(); void unlock() }}><label>이야기 비밀번호<input ref={password} type="text" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={128} required autoFocus disabled={busy} /></label><button className="primary-button" disabled={busy}>{busy ? '확인 중…' : '열기'}</button><button className="soft-button" type="button" disabled={busy} onClick={() => { setLocked(null); setError('') }}>취소</button></form>}
    {error && <p className="story-feedback" role="alert">{error}</p>}
    {error && view.kind === 'list' && !locked && <button className="soft-button" onClick={() => void load()}>다시 불러오기</button>}
  </div>
}
