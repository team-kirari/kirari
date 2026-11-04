import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, MouseEvent, ReactNode } from 'react'
import { ArrowDown, ArrowLeft, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronRight, Clock3, Flower2, Heart, Home, Image as ImageIcon, Maximize2, MessageCircle, MoreHorizontal, Palette, Pause, Play, Repeat2, Search, Send, Settings2, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Users, X } from 'lucide-react'
import { art, gallery, navigation } from './content'
import type { Route } from './content'
import { LiquidTransition } from './components/LiquidTransition'
import type { LiquidHandle } from './components/LiquidTransition'
import { useWidgetDrag } from './components/useWidgetDrag'
import type { WidgetPositions } from './components/useWidgetDrag'
import { PhotoWidget } from './components/PhotoWidget'
import { DDaySettings, DDayWidget } from './components/DDayWidget'
import type { DDay } from './lib/dday'

type Navigate = (route: Route, event?: MouseEvent<HTMLElement>) => void
const icons = { home: Home, profile: Users, gallery: ImageIcon, story: BookOpen, log: CalendarDays, guest: MessageCircle }
const themes = {
  blue: { accent: '#8ba5cb', pale: '#dce7f5', ink: '#526988', pink: '#d8a4b9', background: '#f1f5fb' },
  pink: { accent: '#bf8fa9', pale: '#f1deea', ink: '#805e78', pink: '#a4b3d3', background: '#faf2f6' },
  monochrome: { accent: '#777777', pale: '#e5e5e5', ink: '#333333', pink: '#999999', background: '#f4f4f4' },
}
type Theme = keyof typeof themes
function readRoute(): Route {
  const id = window.location.hash.slice(1).split('?')[0] || 'home'
  return navigation.some(item => item.id === id) ? id as Route : 'not-found'
}

function WidgetTitle({ icon, children, action }: { icon?: ReactNode, children: ReactNode, action?: ReactNode }) {
  return <div className="widget-title"><span>{icon}{children}</span><span className="widget-actions">{action || <MoreHorizontal size={18} aria-hidden="true" />}</span></div>
}

function ProfileCard({ person, navigate }: { person: 'kenji' | 'kiyo', navigate: Navigate }) {
  const [favorite, setFavorite] = useState(false)
  const isKenji = person === 'kenji'
  return <section className={`widget profile-card ${person}`} data-widget-id={person} aria-label={isKenji ? '켄지 프로필' : '키요 프로필'}>
    <div className="profile-label"><span><small>{isKenji ? '01' : '02'}</small> {isKenji ? 'KENJI' : 'KIYO'}</span><span className="widget-actions"><button className="bare" aria-label={`${isKenji ? '켄지' : '키요'} 좋아요`} aria-pressed={favorite} onClick={() => setFavorite(!favorite)}><Heart size={17} fill={favorite ? 'currentColor' : 'none'} /></button></span></div>
    <div className="profile-content"><button className="avatar" aria-label="프로필 보기" onClick={e => navigate('profile', e)}><img src={isKenji ? art.kenji : art.kiyo} alt="" /></button><div><button className="person-name bare" onClick={e => navigate('profile', e)}>{isKenji ? '켄지' : '키요'}<ArrowUpRight size={13} /></button><p>{isKenji ? 'Kenji' : 'Kiyo'}</p><span className="profile-dot">캐릭터 프로필</span></div></div>
    <div className="tag-row"><span>#{isKenji ? '켄지' : '키요'}</span><span>#{isKenji ? '블루' : '핑크'}</span><span>#kirari</span></div>
  </section>
}

function Player() {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(32)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [index, setIndex] = useState(0)
  const tracks = ['kirari', '켄지의 플레이리스트', '키요의 플레이리스트']
  const skip = (amount: number) => { setIndex((index + amount + tracks.length) % tracks.length); setProgress(0) }
  return <section className="widget player" data-widget-id="player" aria-label="플레이리스트">
    <div className="track"><div className="album-art"><Flower2 size={31} /><i>♪</i></div><div><strong>{tracks[index]}</strong><p>음악 위젯 미리보기</p><span>KENJI & KIYO</span></div></div>
    <input className="seek" aria-label="플레이어 진행도 미리보기" type="range" min="0" max="100" value={progress} onChange={e => setProgress(Number(e.target.value))} style={{ '--progress': `${progress}%` } as CSSProperties} />
    <div className="time-row"><span>{Math.floor(progress * 2.24 / 60)}:{String(Math.floor(progress * 2.24 % 60)).padStart(2, '0')}</span><span>3:44</span></div>
    <div className="player-controls"><button aria-label="셔플" aria-pressed={shuffle} onClick={() => setShuffle(!shuffle)}><Shuffle size={16} /></button><button aria-label="이전 곡" onClick={() => skip(-1)}><SkipBack size={18} /></button><button className="play" aria-label={playing ? '시연 일시정지' : '재생 UI 시연'} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><button aria-label="다음 곡" onClick={() => skip(1)}><SkipForward size={18} /></button><button aria-label="반복" aria-pressed={repeat} onClick={() => setRepeat(!repeat)}><Repeat2 size={17} /></button></div>
    <p className="micro player-note">{playing ? '재생 UI 시연 중' : '실제 음원은 연결되지 않았어요'}</p>
  </section>
}

function Messages() {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState(['오늘은 어떤 기록을 남겨볼까?', '그림부터 정리해 보자 ♡'])
  function submit(e: FormEvent) { e.preventDefault(); if (!draft.trim()) return; setMessages([...messages.slice(-1), draft.trim()]); setDraft('') }
  return <section className="widget messages" data-widget-id="messages" aria-label="메시지">
    <div className="chat-lines" aria-live="polite">{messages.map((message, i) => <div className={`chat-line ${i ? 'self' : ''}`} key={`${i}-${message}`}><img src={i ? art.kiyoSD : art.kenjiSD} alt="" /><span>{message}</span></div>)}</div>
    <form onSubmit={submit} className="message-form"><input aria-label="메시지 시연 입력" maxLength={80} placeholder="메시지 입력…" value={draft} onChange={e => setDraft(e.target.value)} /><button aria-label="화면에 메시지 추가" type="submit"><Send size={16} /></button></form>
    <span className="micro">이 화면에서만 보이는 대화 시연</span>
  </section>
}

function CalendarWidget() {
  const today = new Date()
  const date = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'short', day: '2-digit' }).format(today)
  const weekday = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'long' }).format(today)
  return <div className="widget date-widget" data-widget-id="date"><span><CalendarDays size={12} /> {date.toUpperCase()}</span><strong>{new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', day: '2-digit' }).format(today)}</strong><small>{weekday} <span>✧</span></small></div>
}

function HomeScreen({ navigate, hero, feather, positions, setPositions, ddays, photoIndex, playEntrance, setPlayEntrance }: { navigate: Navigate, hero: 'portrait' | 'pair', feather: number, positions: WidgetPositions, setPositions: React.Dispatch<React.SetStateAction<WidgetPositions>>, ddays: DDay[], photoIndex: number, playEntrance: boolean, setPlayEntrance: React.Dispatch<React.SetStateAction<boolean>> }) {
  const [liked, setLiked] = useState(false)
  const [entrance, setEntrance] = useState(playEntrance ? 'waiting' : 'done')
  const drag = useWidgetDrag(positions, setPositions, ddays.map(item => item.id).join(','))
  useEffect(() => {
    if (entrance !== 'waiting') return
    let cancelled = false
    const image = drag.ref.current?.querySelector<HTMLImageElement>('.hero-art img')
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    function reveal() {
      if (cancelled) return
      setEntrance(motion.matches ? 'done' : 'playing')
      setPlayEntrance(false)
    }
    if (motion.matches || !image) reveal()
    else void image.decode().catch(() => {}).then(reveal)
    return () => { cancelled = true }
  }, [entrance, drag.ref, setPlayEntrance])
  useEffect(() => {
    if (entrance !== 'playing') return
    // Interaction can cancel an individual animation, including the last widget.
    const timer = window.setTimeout(() => setEntrance('done'), 2000)
    return () => window.clearTimeout(timer)
  }, [entrance])
  return <div className={`desktop-scene scene-entrance-${entrance}`} {...drag} onAnimationEnd={event => {
    if ((event.target as HTMLElement).dataset.widgetId === 'dock') setEntrance('done')
  }}>
    <div className="scene-watermark" aria-hidden="true">kirari<span>✳</span></div>
    <div className="background-panel panel-one" aria-hidden="true"><div /><div /><div /></div>
    <div className="background-panel panel-two" aria-hidden="true"><span>✧</span></div>
    <div className="frame-corner corner-one" aria-hidden="true" /><div className="frame-corner corner-two" aria-hidden="true" />
    <span className="decoration star-one" aria-hidden="true">✧</span><span className="decoration star-two" aria-hidden="true">✦</span><span className="decoration plus-one" aria-hidden="true">＋</span><span className="decoration dot-matrix" aria-hidden="true">····<br />····<br />····</span>
    <svg className="art-filter-definitions" aria-hidden="true" width="0" height="0"><defs><filter id="hero-edge-feather" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation={feather / 2} result="soft-alpha" /><feComposite in="SourceGraphic" in2="soft-alpha" operator="in" /></filter></defs></svg>
    <div className="hero-art"><img className={hero === 'pair' ? 'chibi-hero' : ''} style={{ filter: feather > 0 ? 'url(#hero-edge-feather)' : 'none' }} src={art[hero]} alt="함께 있는 켄지와 키요" fetchPriority="high" /></div>
    <ProfileCard person="kenji" navigate={navigate} />
    <ProfileCard person="kiyo" navigate={navigate} />
    <CalendarWidget />
    <DDayWidget items={ddays} />
    <div className={`floating-chip heart-chip ${liked ? 'liked' : ''}`} data-widget-id="heart"><button className="bare heart-action" aria-label="좋아요" aria-pressed={liked} onClick={() => setLiked(!liked)}><Heart size={16} fill={liked ? 'currentColor' : 'none'} /><span>{liked ? '좋아요!' : '좋아요'}</span></button></div>
    <Messages />
    <section className="widget recent-widget" data-widget-id="recent"><WidgetTitle icon={<Clock3 size={16} />} action={<button className="bare" aria-label="기록 더 보기" onClick={e => navigate('log', e)}><ArrowUpRight size={16} /></button>}>최근 기록</WidgetTitle><button className="recent-row" onClick={e => navigate('gallery', e)}><span className="recent-icon"><ImageIcon size={15} /></span><span>갤러리 둘러보기<small>일러스트 6장</small></span><ChevronRight size={14} /></button><button className="recent-row" onClick={e => navigate('story', e)}><span className="recent-icon pink"><BookOpen size={15} /></span><span>이야기 보관함<small>차근차근 채워 갈 공간</small></span><ChevronRight size={14} /></button></section>
    <PhotoWidget index={photoIndex} openGallery={e => navigate('gallery', e)} />
    <Player />
    <div className="home-dock" data-widget-id="dock">{navigation.filter(n => ['story', 'guest'].includes(n.id)).map((n, i) => { const Icon = icons[n.id]; return <button key={n.id} className={i % 2 ? 'dock-pink' : ''} onClick={e => navigate(n.id, e)}><span className="dock-top"><small>0{i + 1}</small><ArrowUpRight size={17} /></span><Icon size={27} strokeWidth={1.5} /><span>{n.label}</span></button> })}</div>
    <span className="scene-bottom-mark" aria-hidden="true">✦ <span>kirari</span> ✦</span>
  </div>
}

function GalleryScreen({ query, setQuery }: { query: string, setQuery: (q: string) => void }) {
  const [filter, setFilter] = useState('전체')
  const [selected, setSelected] = useState<typeof gallery[number] | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const items = gallery.filter(item => (filter === '전체' || filter === item.category) && `${item.title} ${item.category}`.toLowerCase().includes(query.toLowerCase()))
  function open(item: typeof gallery[number]) { setSelected(item); dialog.current?.showModal() }
  return <>
    <div className="gallery-tools"><div className="filter-tabs">{['전체', '페어', '켄지', '키요'].map(t => <button key={t} aria-pressed={filter === t} onClick={() => setFilter(t)}>{t}</button>)}</div><label className="inline-search"><Search size={16} /><input aria-label="갤러리 검색" placeholder="그림 찾기…" value={query} onChange={e => setQuery(e.target.value)} /></label><span className="result-count">{items.length}개의 그림</span></div>
    {items.length ? <div className="gallery-grid">{items.map((item, i) => <button className={`gallery-item ${item.className}`} key={item.id} onClick={() => open(item)}><div className="gallery-image"><img src={item.src} alt={item.title} loading="lazy" /><span className="expand"><Maximize2 size={16} /></span><small>0{i + 1}</small></div><div className="gallery-caption"><div><strong>{item.title}</strong><span>{item.credit}</span></div><span className="category-tag">{item.category}</span></div></button>)}</div> : <div className="empty-state"><Search size={32} /><h2>찾는 그림이 없어요</h2><p>다른 이름이나 태그로 검색해 보세요.</p><button className="soft-button" onClick={() => { setQuery(''); setFilter('전체') }}>검색 초기화</button></div>}
    <dialog ref={dialog} className="art-dialog" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close() }}><div className="dialog-inner"><button className="dialog-close icon-button" aria-label="이미지 닫기" onClick={() => dialog.current?.close()}><X size={20} /></button>{selected && <><img src={selected.src} alt={selected.title} /><div><strong>{selected.title}</strong><span>{selected.credit}</span></div></>}</div></dialog>
  </>
}

function GuestScreen() {
  const [notes, setNotes] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const submit = (e: FormEvent) => { e.preventDefault(); if (draft.trim()) { setNotes([draft.trim(), ...notes]); setDraft('') } }
  return <div className="guest-layout"><div className="guest-intro"><img src={art.pair} alt="켄지와 키요" /><span className="category-tag">방명록 미리보기</span><h2>한 줄 남기기</h2><p>작성한 글은 지금 화면에만 표시돼요.<br />새로고침하면 사라집니다.</p></div><div><form className="guest-form" onSubmit={submit}><label htmlFor="guest-message">메시지</label><textarea id="guest-message" required maxLength={180} placeholder="메시지를 적어 주세요." value={draft} onChange={e => setDraft(e.target.value)} /><div><span>{draft.length} / 180</span><button className="primary-button" type="submit">화면에 남기기 <ArrowUpRight size={16} /></button></div></form><div className="guest-notes" aria-live="polite">{notes.length ? notes.map((note, i) => <article key={i}><Heart size={16} /><p>{note}</p><span>방문자 · 화면 시연</span></article>) : <div className="empty-note"><MessageCircle size={26} /><p>아직 남겨진 메시지가 없어요.</p></div>}</div></div></div>
}

function InnerScreen({ route, navigate, query, setQuery }: { route: Route, navigate: Navigate, query: string, setQuery: (q: string) => void }) {
  const info = { profile: ['두 사람의 프로필', '켄지와 키요를 소개합니다.'], gallery: ['갤러리', '그림과 함께 남기는 기록.'], story: ['이야기', '긴 이야기와 짧은 에피소드를 모아 둘 공간.'], log: ['기록', '새로 더한 그림과 페이지를 한눈에.'], guest: ['방명록', '가볍게 남기는 한 줄.'], 'not-found': ['페이지를 찾을 수 없어요', '주소를 확인하거나 홈으로 돌아가 주세요.'], home: ['', ''] }[route]
  return <section className="inner-screen"><button className="back-link" onClick={e => navigate('home', e)}><ArrowLeft size={15} /> 홈으로</button><div className="page-heading"><div><span className="page-kicker">kirari <span>/</span> {navigation.find(n => n.id === route)?.label || '404'}</span><h1 tabIndex={-1}>{info[0]}<span>✦</span></h1><p>{info[1]}</p></div><span className="page-icon">{route === 'not-found' ? <Search size={28} /> : (() => { const Icon = icons[route]; return <Icon size={28} strokeWidth={1.5} /> })()}</span></div>
    {route === 'gallery' && <GalleryScreen query={query} setQuery={setQuery} />}
    {route === 'profile' && <div className="profile-page">{[{ name: '켄지', en: 'KENJI', src: art.kenji, color: 'blue', number: '01' }, { name: '키요', en: 'KIYO', src: art.kiyo, color: 'pink', number: '02' }].map(person => <article className={`profile-detail ${person.color}`} key={person.en}><div className="profile-detail-art"><span>{person.number}</span><img src={person.src} alt={person.name} /></div><div className="profile-detail-info"><span>{person.en}</span><h2>{person.name}<Heart size={20} /></h2><p>프로필을 채워 갈 공간이에요.<br />소개와 키워드는 다음 단계에서 추가할 수 있어요.</p><div className="tag-row"><span>#{person.name}</span><span>#kirari</span></div></div></article>)}</div>}
    {route === 'story' && <div className="story-empty"><div className="empty-illustration"><BookOpen size={56} strokeWidth={1} /><span>✧</span><img src={art.kiyoSD} alt="" /></div><h2>아직 펼치지 않은 이야기</h2><p>이야기가 등록되면 이곳에 모아 보여 드릴게요.</p><span className="category-tag">콘텐츠 준비 중</span></div>}
    {route === 'log' && <div className="log-list"><article><span className="log-dot" /><div className="log-date">미리보기</div><div><span className="category-tag">갤러리</span><h2>켄지와 키요의 그림 모음</h2><p>제공해 주신 일러스트 6장을 갤러리에서 볼 수 있어요.</p><button className="soft-button" onClick={e => navigate('gallery', e)}>갤러리 열기 <ArrowUpRight size={15} /></button></div><img src={art.pair} alt="" /></article><article><span className="log-dot pink" /><div className="log-date">준비 중</div><div><span className="category-tag">기록</span><h2>앞으로 쌓일 기록들</h2><p>실제 업데이트 기록은 다음 단계에서 연결합니다.</p></div></article></div>}
    {route === 'guest' && <GuestScreen />}
    {route === 'not-found' && <div className="empty-state"><span className="error-number">404</span><button className="primary-button" onClick={e => navigate('home', e)}>홈으로 돌아가기 <ArrowUpRight size={16} /></button></div>}
  </section>
}

export default function App() {
  const [playEntrance, setPlayEntrance] = useState(true)
  const [route, setRoute] = useState<Route>(readRoute)
  const [theme, setTheme] = useState<Theme>('blue')
  const [hero, setHero] = useState<'portrait' | 'pair'>('portrait')
  const [feather, setFeather] = useState(0)
  const [widgetPositions, setWidgetPositions] = useState<WidgetPositions>({})
  const [ddays, setDdays] = useState<DDay[]>([{ id: 'first', title: 'D-day', date: '' }])
  const [photoIndex] = useState(() => Math.floor(Math.random() * gallery.length))
  const [settings, setSettings] = useState(false)
  const [query, setQuery] = useState('')
  const transition = useRef<LiquidHandle>(null)
  const currentTheme = themes[theme]
  const settingsRef = useRef<HTMLDivElement>(null)
  const settingsToggle = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const sync = () => { setRoute(readRoute()); setSettings(false) }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  useEffect(() => {
    document.title = route === 'home' ? 'kirari' : `${navigation.find(n => n.id === route)?.label || '404'} · kirari`
  }, [route])
  useEffect(() => {
    if (!settings) return
    function dismiss(event: PointerEvent) { if (!settingsRef.current?.contains(event.target as Node) && !settingsToggle.current?.contains(event.target as Node)) setSettings(false) }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { setSettings(false); settingsToggle.current?.focus() } }
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', escape) }
  }, [settings])

  const navigate: Navigate = (next, event) => {
    if (next === route) return
    if (document.querySelector('.liquid-transition[data-active="true"]')) return
    const showPage = () => {
      window.location.hash = next
      setRoute(next)
      setSettings(false)
      window.scrollTo({ top: 0, behavior: 'instant' })
      requestAnimationFrame(() => document.querySelector<HTMLElement>(next === 'home' ? '.brand' : '.page-heading h1')?.focus({ preventScroll: true }))
    }
    if (route !== 'home' && next !== 'home') {
      showPage()
      return
    }
    const rect = event?.currentTarget.getBoundingClientRect()
    const x = event?.detail ? event.clientX : rect ? rect.left + rect.width / 2 : innerWidth / 2
    const y = event?.detail ? event.clientY : rect ? rect.top + rect.height / 2 : innerHeight / 2
    transition.current?.play(x, y, next === 'gallery' || next === 'guest' ? '#f1dce7' : currentTheme.pale, showPage)
  }
  const variables = { '--accent': currentTheme.accent, '--pale': currentTheme.pale, '--ink': currentTheme.ink, '--pink': currentTheme.pink, '--page-bg': currentTheme.background } as CSSProperties
  return <div className="app-shell" data-theme={theme} style={variables}>
    <a className="skip-link" href="#main">본문으로 건너뛰기</a>
    <header className="topbar"><button className="brand" onClick={e => navigate('home', e)} aria-label="kirari 홈"><span className="brand-symbol">✳</span><span>kirari<span className="brand-dot">.</span></span></button><form className="header-search" onSubmit={e => { e.preventDefault(); navigate('gallery') }}><Search size={15} /><input aria-label="공개 그림 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="기록 찾아보기" /><kbd>↵</kbd></form><nav aria-label="메인 메뉴">{navigation.map(n => <button key={n.id} className={route === n.id ? 'active' : ''} aria-current={route === n.id ? 'page' : undefined} onClick={e => navigate(n.id, e)}>{n.label}</button>)}</nav><button className={`header-settings icon-button ${settings ? 'selected' : ''}`} ref={settingsToggle} aria-label="화면 설정" aria-expanded={settings} aria-controls="appearance-settings" onClick={() => setSettings(!settings)}><SlidersHorizontal size={18} /></button></header>
    <div className="workspace"><aside className="side-rail" aria-label="바로가기">{navigation.map(n => { const Icon = icons[n.id]; return <button key={n.id} aria-label={n.label} title={n.label} aria-current={route === n.id ? 'page' : undefined} onClick={e => navigate(n.id, e)}><Icon size={20} strokeWidth={1.6} /></button> })}<span className="rail-divider" /><button aria-label="화면 설정 열기" onClick={() => { setSettings(!settings); settingsToggle.current?.focus() }}><Settings2 size={20} strokeWidth={1.6} /></button><span className="rail-flower" aria-hidden="true">✳</span></aside><main id="main" tabIndex={-1}>{route === 'home' ? <HomeScreen playEntrance={playEntrance} setPlayEntrance={setPlayEntrance} navigate={navigate} hero={hero} feather={feather} positions={widgetPositions} setPositions={setWidgetPositions} ddays={ddays} photoIndex={photoIndex} /> : <InnerScreen route={route} navigate={navigate} query={query} setQuery={setQuery} />}</main></div>
    <footer><span><i /> kirari <span className="footer-divider">/</span> 켄지 & 키요</span><span>외관 미리보기 <span className="footer-spark">✦</span><button onClick={() => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })} aria-label="맨 위로"><ArrowDown size={12} /></button></span></footer>
    {settings && <div ref={settingsRef} className="settings-panel widget" id="appearance-settings">
      <WidgetTitle icon={<Palette size={16} />} action={<button className="bare" aria-label="설정 닫기" onClick={() => { setSettings(false); settingsToggle.current?.focus() }}><X size={16} /></button>}>화면 설정</WidgetTitle>
      <p>위젯 컬러</p>
      <div className="theme-options">{(Object.keys(themes) as Theme[]).map(t => <button key={t} className={theme === t ? 'selected' : ''} onClick={() => setTheme(t)}><i style={{ background: themes[t].accent }} />{({ blue: '블루', pink: '핑크', monochrome: '흑백' })[t]}{theme === t && <Check size={13} />}</button>)}</div>
      <p>메인 일러스트</p>
      <div className="art-options"><button aria-pressed={hero === 'portrait'} onClick={() => setHero('portrait')}><img src={art.portrait} alt="페어 커미션" /></button><button aria-pressed={hero === 'pair'} onClick={() => setHero('pair')}><img src={art.pair} alt="작은 페어 일러스트" /></button></div>
      <div className="feather-setting">
        <label htmlFor="hero-feather">메인 일러스트 경계 페더</label>
        <div>
          <input id="hero-feather" type="range" min="0" max="40" step="1" value={feather} onChange={e => setFeather(Number(e.target.value))} />
          <input className="feather-number" aria-label="메인 일러스트 경계 페더값" type="number" min="0" max="40" step="1" value={feather} onChange={e => { const value = Number(e.target.value); if (Number.isFinite(value)) setFeather(Math.max(0, Math.min(40, Math.round(value)))) }} />
          <span>px</span>
        </div>
        <p>0은 원본 경계, 값이 클수록 가장자리가 부드러워져요.</p>
      </div>
      <DDaySettings items={ddays} setItems={setDdays} />
      <p>위젯 배치</p>
      <button className="soft-button reset-widget-positions" onClick={() => setWidgetPositions({})}>위젯 위치 초기화</button>
      <small>현재 화면에만 적용됩니다.</small>
    </div>}
    <LiquidTransition ref={transition} />
  </div>
}
