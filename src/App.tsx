import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { preparePage } from './lib/prepare-page'
import { ArrowUpRight, BookOpen, CalendarDays, Dices, Heart, Home, Image as ImageIcon, MessageCircle, MoreHorizontal, Palette, Search, Settings2, SlidersHorizontal, Users, X } from 'lucide-react'
import { art, gallery, navigation } from './content'
import type { Route } from './content'
import { useSelectionIndicator } from './components/useSelectionIndicator'
import { LiquidTransition } from './components/LiquidTransition'
import type { LiquidHandle } from './components/LiquidTransition'
import { useWidgetDrag } from './components/useWidgetDrag'
import type { WidgetPositions } from './components/useWidgetDrag'
import { MusicWidget } from './components/MusicWidget'
import { useMusicPlayback } from './lib/useMusicPlayback'
import type { MusicPlayback } from './lib/useMusicPlayback'
import { PhotoWidget } from './components/PhotoWidget'
import { DDaySettings, DDayWidget } from './components/DDayWidget'
import type { DDay } from './lib/dday'
import { useSiteSettings } from './lib/useSiteSettings'
import { GuestWidget, StoryWidget } from './components/NotebookWidgets'
import { LikeWidget } from './components/LikeWidget'
import { Messages } from './components/Messages'
import type { MessageWriter } from './lib/messages'
import { AdminLogin } from './components/AdminLogin'
import type { GuestNotesProps } from './components/NotebookWidgets'
import { GuestScreen } from './components/GuestScreen'
import { useGuestbook } from './lib/useGuestbook'
import { ProfileScreen } from './components/ProfileScreen'
import { useSharedProfiles } from './lib/useSharedProfiles'
import { GalleryScreen } from './components/GalleryScreen'
import { TimelineScreen } from './components/TimelineScreen'
import { useGallery } from './lib/useGallery'
import { StoryScreen } from './components/StoryScreen'
import { TrpgLogScreen } from './components/TrpgLogScreen'
import { readTheme, saveTheme, resetTheme } from './lib/theme'
import type { Theme } from './lib/theme'
import { personalityTags } from './lib/profiles'
import type { CharacterProfile, PersonId, Profiles } from './lib/profiles'

type Navigate = (route: Route, event?: MouseEvent<HTMLElement>, person?: PersonId) => void
const icons = { home: Home, profile: Users, gallery: ImageIcon, story: BookOpen, log: CalendarDays, trpg: Dices, guest: MessageCircle }
const themes = {
  blue: { accent: '#8ba5cb', pale: '#dce7f5', ink: '#526988', pink: '#d8a4b9', background: '#f1f5fb' },
  pink: { accent: '#bf8fa9', pale: '#f1deea', ink: '#805e78', pink: '#a4b3d3', background: '#faf2f6' },
  monochrome: { accent: '#777777', pale: '#e5e5e5', ink: '#333333', pink: '#999999', background: '#f4f4f4' },
}
function readRoute(): Route {
  const id = window.location.hash.slice(1).split('?')[0] || 'home'
  return navigation.some(item => item.id === id) ? id as Route : 'not-found'
}

function WidgetTitle({ icon, children, action }: { icon?: ReactNode, children: ReactNode, action?: ReactNode }) {
  return <div className="widget-title"><span>{icon}{children}</span><span className="widget-actions">{action || <MoreHorizontal size={18} aria-hidden="true" />}</span></div>
}

function ProfileCard({ person, profile, navigate }: { person: PersonId, profile: CharacterProfile, navigate: Navigate }) {
  const [favorite, setFavorite] = useState(false)
  const isKenji = person === 'kenji'
  const tags = personalityTags(profile.tags)
  const details = [['나이', profile.age], ['생일', profile.birthday], ['키', profile.height ? `${profile.height} cm` : ''], ['성격', profile.outside], ['좋아하는 것', profile.likes]].filter(([, value]) => value.trim())
  return <section className={`widget profile-card ${person}`} data-widget-id={person} aria-label={`${profile.name} 프로필`}>
    <div className="profile-label"><span>{isKenji ? 'KENJI' : 'KIYO'}</span><span className="widget-actions"><button className="bare" aria-label={`${isKenji ? '켄지' : '키요'} 좋아요`} aria-pressed={favorite} onClick={() => setFavorite(!favorite)}><Heart size={17} fill={favorite ? 'currentColor' : 'none'} /></button></span></div>
    <div className="profile-content"><button className="avatar" aria-label="프로필 보기" onClick={e => navigate('profile', e, person)}><img src={isKenji ? art.kenji : art.kiyo} alt="" /></button><div><button className="person-name bare" onClick={e => navigate('profile', e, person)}>{profile.name}<ArrowUpRight size={13} /></button><p>{profile.originalName || (isKenji ? 'Kenji' : 'Kiyo')}</p><span className="profile-dot">{profile.quote || '아직 한마디가 없어요'}</span></div></div>
    <div className="tag-row">{tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
    <div className="profile-preview"><dl>{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><button className="bare" onClick={e => navigate('profile', e, person)}>프로필 자세히 보기 <ArrowUpRight size={12} /></button></div>
  </section>
}

function CalendarWidget() {
  const today = new Date()
  const date = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'short', day: '2-digit' }).format(today)
  const weekday = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'long' }).format(today)
  return <div className="widget date-widget" data-widget-id="date"><span><CalendarDays size={12} /> {date.toUpperCase()}</span><strong>{new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', day: '2-digit' }).format(today)}</strong><small>{weekday} <span>✧</span></small></div>
}

function HomeScreen({ photos, profiles, writer, admin, music, guest, navigate, hero, feather, positions, setPositions, ddays, photoIndex, playEntrance, setPlayEntrance, draggable, loading }: { photos: { src: string, title: string }[], profiles: Profiles, writer: MessageWriter | null, admin: boolean, loading: boolean, draggable: boolean, music: MusicPlayback, navigate: Navigate, hero: 'portrait' | 'pair', feather: number, positions: WidgetPositions, setPositions: React.Dispatch<React.SetStateAction<WidgetPositions>>, ddays: DDay[], photoIndex: number, playEntrance: boolean, setPlayEntrance: React.Dispatch<React.SetStateAction<boolean>> } & GuestNotesProps) {
  const [entrance, setEntrance] = useState(playEntrance ? 'waiting' : 'done')
  const drag = useWidgetDrag(positions, setPositions, `${loading}:` + ddays.map(item => item.id).join(','), draggable && !loading)
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
    if (entrance !== 'playing' || loading) return
    let cancelled = false
    const animations = drag.ref.current?.getAnimations({ subtree: true }).filter(animation =>
      animation instanceof CSSAnimation && ['scene-hero-rise', 'scene-widget-rise'].includes(animation.animationName)
    ) ?? []
    // Widgets mount after the layout arrives; wait for their own full animations.
    // Cancelled animations also settle so dragging or focusing cannot stall this.
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (!cancelled) setEntrance('done')
    })
    return () => { cancelled = true }
  }, [entrance, loading, drag.ref])
  return <div className={`desktop-scene scene-entrance-${entrance}`} data-draggable={draggable} data-page-loading={loading} {...drag}>
    <div className="scene-watermark" aria-hidden="true">kirari<span>✳</span></div>
    <div className="background-panel panel-one" aria-hidden="true"><div /><div /><div /></div>
    <div className="background-panel panel-two" aria-hidden="true"><span>✧</span></div>
    <div className="frame-corner corner-one" aria-hidden="true" /><div className="frame-corner corner-two" aria-hidden="true" />
    <span className="decoration star-one" aria-hidden="true">✧</span><span className="decoration star-two" aria-hidden="true">✦</span><span className="decoration plus-one" aria-hidden="true">＋</span><span className="decoration dot-matrix" aria-hidden="true">····<br />····<br />····</span>
    <svg className="art-filter-definitions" aria-hidden="true" width="0" height="0"><defs><filter id="hero-edge-feather" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation={feather / 2} result="soft-alpha" /><feComposite in="SourceGraphic" in2="soft-alpha" operator="in" /></filter></defs></svg>
    <div className="hero-art"><img className={hero === 'pair' ? 'chibi-hero' : ''} style={{ filter: feather > 0 ? 'url(#hero-edge-feather)' : 'none' }} src={art[hero]} alt="함께 있는 켄지와 키요" fetchPriority="high" /></div>
    {!loading && <>
    <ProfileCard person="kenji" profile={profiles.kenji} navigate={navigate} />
    <ProfileCard person="kiyo" profile={profiles.kiyo} navigate={navigate} />
    <div className="date-widgets">
      <CalendarWidget />
      <DDayWidget items={ddays} />
    </div>
    <LikeWidget />
    <Messages key={`${admin}:${writer ? `${writer.uid}:${writer.character}` : "guest"}`} writer={writer} admin={admin} />
    <PhotoWidget items={photos} index={photoIndex} openGallery={e => navigate('gallery', e)} />
    <MusicWidget playback={music} />
    <div className="notebook-widgets">
      <StoryWidget onOpen={event => navigate('story', event)} />
      <GuestWidget guest={guest} />
    </div>
    </>}
    <span className="scene-bottom-mark" aria-hidden="true">✦ <span>kirari</span> ✦</span>
  </div>
}

function InnerScreen({ localGallery, route, query, setQuery, guest, admin, sharedProfiles, profilePerson }: { localGallery: ReturnType<typeof useGallery>, profilePerson: PersonId, sharedProfiles: ReturnType<typeof useSharedProfiles>, admin: boolean, route: Route, query: string, setQuery: (q: string) => void } & GuestNotesProps) {
  const info = { profile: ['프로필', ''], gallery: ['갤러리', ''], story: ['이야기', ''], log: ['타임라인', ''], trpg: ['로그', ''], guest: ['방명록', ''], 'not-found': ['페이지를 찾을 수 없어요', '주소를 확인하거나 홈으로 돌아가 주세요.'], home: ['', ''] }[route]
  return <section className="inner-screen" data-page-loading={route === 'profile' ? !sharedProfiles.ready && !sharedProfiles.status : route === 'gallery' ? localGallery.loading : false}><div className="page-heading"><div><>{route === 'not-found' && <span className="page-kicker">kirari <span>/</span> 404</span>}<h1 tabIndex={-1}>{info[0]}<span>✦</span></h1>{info[1] && <p>{info[1]}</p>}</></div>{route !== 'profile' && <span className="page-icon">{route === 'not-found' ? <Search size={28} /> : (() => { const Icon = icons[route]; return <Icon size={28} strokeWidth={1.5} /> })()}</span>}</div>
    {route === 'gallery' && <GalleryScreen query={query} setQuery={setQuery} admin={admin} gallery={localGallery} />}
    {route === 'profile' && !sharedProfiles.ready && !sharedProfiles.status && <p role="status">프로필을 불러오는 중…</p>}
    {route === 'profile' && (sharedProfiles.ready || sharedProfiles.status) && <ProfileScreen initialPerson={profilePerson} admin={admin} shared={sharedProfiles} />}
    {route === 'story' && <StoryScreen admin={admin} />}
    {route === 'log' && <TimelineScreen admin={admin} />}
    {route === 'trpg' && <TrpgLogScreen key={String(admin)} admin={admin} />}
    {route === 'guest' && <GuestScreen guest={guest} admin={admin} />}
    {route === 'not-found' && <div className="empty-state"><span className="error-number">404</span></div>}
  </section>
}

export default function App() {
  const { host: musicHost, ...music } = useMusicPlayback()
  const guest = useGuestbook()
  const localGallery = useGallery()
  const [playEntrance, setPlayEntrance] = useState(true)
  const sharedProfiles = useSharedProfiles()
  const [profilePerson, setProfilePerson] = useState<PersonId>('kenji')
  const [route, setRoute] = useState<Route>(readRoute)
  const [theme, setTheme] = useState<Theme>(() => {
    try { return readTheme(window.localStorage) } catch { return 'blue' }
  })
  const [themeStatus, setThemeStatus] = useState('')
  function selectTheme(next: Theme, reset = false) {
    setTheme(next)
    try {
      if (reset) resetTheme(window.localStorage)
      else saveTheme(window.localStorage, next)
      setThemeStatus(reset ? '테마를 기본값으로 초기화했습니다.' : '이 브라우저에 테마를 저장했습니다.')
    } catch { setThemeStatus('테마를 저장하지 못했습니다. 현재 화면에만 적용됩니다.') }
  }
  const [settings, setSettings] = useState(false)
  const [admin, setAdmin] = useState(false)
  const [writer, setWriter] = useState<MessageWriter | null>(null)
  const shared = useSiteSettings()
  const { setDraft } = shared
  const editing = admin && route === 'home' && shared.draft !== null
  const appearance = editing ? shared.draft! : shared.published
  const { hero, feather, ddays } = appearance
  // Visitor moves live only in React state and never enter the shared draft.
  const [localPositions, setLocalPositions] = useState<WidgetPositions | null>(null)
  const widgetPositions = editing ? appearance.positions : localPositions ?? shared.published.positions
  const changeDraft = useCallback(<K extends 'hero' | 'feather' | 'ddays' | 'positions',>(key: K, value: React.SetStateAction<typeof appearance[K]>) => {
    setDraft(previous => previous ? { ...previous, [key]: typeof value === 'function' ? value(previous[key]) : value } : null)
  }, [setDraft])
  const setWidgetPositions = useCallback((value: React.SetStateAction<WidgetPositions>) => {
    if (editing) {
      if (!shared.saving) changeDraft('positions', value)
      return
    }
    setLocalPositions(previous => typeof value === 'function' ? value(previous ?? shared.published.positions) : value)
  }, [editing, shared.saving, shared.published.positions, changeDraft])
  const setDdays = (value: React.SetStateAction<DDay[]>) => changeDraft('ddays', value)
  const setHero = (value: 'portrait' | 'pair') => changeDraft('hero', value)
  const setFeather = (value: number) => changeDraft('feather', value)
  const onAdminChange = useCallback((value: boolean, nextWriter: MessageWriter | null = null) => {
    setAdmin(value)
    setWriter(nextWriter)
    if (!value) { setDraft(null); setSettings(false) }
  }, [setDraft])
  const [photoIndex, setPhotoIndex] = useState(() => gallery.length ? Math.floor(Math.random() * gallery.length) : 0)
  const [query, setQuery] = useState('')
  const transition = useRef<LiquidHandle>(null)
  const [pendingRoute, setPendingRoute] = useState<Route | null>(null)
  const pageRoots = useRef(new Map<Route, HTMLElement>())
  const preparation = useRef<AbortController | null>(null)
  useEffect(() => () => preparation.current?.abort(), [])
  const topNavigation = useSelectionIndicator<HTMLElement>(route)
  const sideNavigation = useSelectionIndicator<HTMLElement>(route)
  const currentTheme = themes[theme]
  const settingsToggle = useRef<HTMLButtonElement>(null)
  const cancelSettings = useCallback(() => {
    setDraft(null)
    setSettings(false)
    settingsToggle.current?.focus()
  }, [setDraft])
  function toggleSettings() {
    if (shared.saving || route !== 'home') return
    if (settings) cancelSettings()
    else if (shared.ready) { setDraft(shared.published); setSettings(true) }
  }
  const activeRoute = useRef(route)
  const changeRoute = useCallback((next: Route, origin?: { x: number, y: number }) => {
    if (activeRoute.current === next) return
    const transitionThroughHome = activeRoute.current === 'home' || next === 'home'
    const returningHome = next === 'home' && activeRoute.current !== 'home'
    activeRoute.current = next
    preparation.current?.abort()
    const controller = new AbortController()
    preparation.current = controller
    flushSync(() => {
      if (returningHome && localGallery.items.length > 1) {
        setPhotoIndex(previous => (previous + 1 + Math.floor(Math.random() * (localGallery.items.length - 1))) % localGallery.items.length)
      }
      if (returningHome) setPlayEntrance(true)
      setDraft(null)
      setSettings(false)
      setPendingRoute(next)
    })
    const destination = pageRoots.current.get(next)
    const ready = transitionThroughHome && destination ? preparePage(destination, controller.signal) : Promise.resolve()
    const commit = () => {
      if (controller.signal.aborted) return
      flushSync(() => {
        setRoute(next)
        setPendingRoute(null)
        setSettings(false)
      })
      window.scrollTo({ top: 0, behavior: 'instant' })
      requestAnimationFrame(() => document.querySelector<HTMLElement>(next === 'home' ? '.brand' : '.page-heading h1')?.focus({ preventScroll: true }))
    }
    if (transitionThroughHome && transition.current) {
      transition.current.play(origin?.x ?? window.innerWidth / 2, origin?.y ?? window.innerHeight / 2,
        next === 'gallery' || next === 'guest' ? '#f1dce7' : currentTheme.pale, commit, ready)
    } else commit()
  }, [currentTheme.pale, setDraft, localGallery.items.length])
  useEffect(() => {
    const sync = () => changeRoute(readRoute())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [changeRoute])
  useEffect(() => {
    document.title = route === 'home' ? 'kirari' : `${navigation.find(n => n.id === route)?.label || '404'} · kirari`
  }, [route])
  useEffect(() => {
    if (!settings) return
    function escape(event: KeyboardEvent) { if (event.key === 'Escape' && !shared.saving) cancelSettings() }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [settings, shared.saving, cancelSettings])

  const navigate: Navigate = (next, event, person) => {
    if (next === activeRoute.current) return
    if (person) setProfilePerson(person)
    window.location.hash = next
    const rect = event?.currentTarget.getBoundingClientRect()
    const origin = event ? {
      x: event.detail ? event.clientX : rect!.left + rect!.width / 2,
      y: event.detail ? event.clientY : rect!.top + rect!.height / 2,
    } : undefined
    changeRoute(next, origin)
  }

  const variables = { '--accent': currentTheme.accent, '--pale': currentTheme.pale, '--ink': currentTheme.ink, '--pink': currentTheme.pink, '--page-bg': currentTheme.background } as CSSProperties
  return <div className="app-shell" data-theme={theme} style={variables}>
    <a className="skip-link" href="#main">본문으로 건너뛰기</a>
    <header className="topbar"><button className="brand" onClick={e => navigate('home', e)} aria-label="kirari 홈"><span className="brand-symbol">✳</span><span>kirari<span className="brand-dot">.</span></span></button><form className="header-search" onSubmit={e => { e.preventDefault(); navigate('gallery') }}><Search size={15} /><input aria-label="공개 그림 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="기록 찾아보기" /><kbd>↵</kbd></form><nav ref={topNavigation} className="selection-track" aria-label="메인 메뉴"><span className="selection-indicator" aria-hidden="true" />{navigation.map(n => <button key={n.id} className={route === n.id ? 'active' : ''} aria-current={route === n.id ? 'page' : undefined} onClick={e => navigate(n.id, e)}>{n.label}</button>)}</nav><div className="header-themes" role="group" aria-label="테마 색상">{(Object.keys(themes) as Theme[]).map(t => <button type="button" key={t} aria-label={`${({ blue: '블루', pink: '핑크', monochrome: '흑백' })[t]} 테마`} aria-pressed={theme === t} style={{ '--swatch': themes[t].accent } as CSSProperties} onClick={() => selectTheme(t)} />)}</div><span className="theme-spacer" aria-hidden="true" />{admin && route === 'home' && <button className={`header-settings icon-button ${settings ? 'selected' : ''}`} ref={settingsToggle} aria-label="화면 설정" aria-expanded={settings} aria-controls="appearance-settings" disabled={!shared.ready || shared.saving} onClick={toggleSettings}><SlidersHorizontal size={18} /></button>}</header>
    {themeStatus && <p className="theme-status" role="status">{themeStatus}</p>}
    {shared.status && <p className="site-settings-status" role="status">{shared.status}</p>}
    <div className="workspace"><aside ref={sideNavigation} className="side-rail selection-track" aria-label="바로가기"><span className="selection-indicator" aria-hidden="true" />{navigation.map(n => { const Icon = icons[n.id]; return <button key={n.id} aria-label={n.label} title={n.label} aria-current={route === n.id ? 'page' : undefined} onClick={e => navigate(n.id, e)}><Icon size={20} strokeWidth={1.6} /></button> })}<span className="rail-divider" />{admin && route === 'home' && <button aria-label="화면 설정 열기" aria-expanded={settings} disabled={!shared.ready || shared.saving} onClick={toggleSettings}><Settings2 size={20} strokeWidth={1.6} /></button>}<span className="rail-flower" aria-hidden="true">✳</span></aside><div className="page-stack">{[route, ...(pendingRoute && pendingRoute !== route ? [pendingRoute] : [])].map(screen => <main key={screen} ref={element => { if (element) pageRoots.current.set(screen, element); else pageRoots.current.delete(screen) }} className={`page-transition ${screen !== route ? 'page-preparing' : ''}`} id={screen === route ? 'main' : undefined} aria-hidden={screen !== route || undefined} inert={screen !== route} tabIndex={-1}>{screen === 'home' ? <HomeScreen photos={localGallery.items} profiles={sharedProfiles.profiles} writer={writer} admin={admin} loading={shared.loading} draggable={!shared.saving} music={music} guest={guest} playEntrance={playEntrance} setPlayEntrance={setPlayEntrance} navigate={navigate} hero={hero} feather={feather} positions={widgetPositions} setPositions={setWidgetPositions} ddays={ddays} photoIndex={photoIndex} /> : <InnerScreen localGallery={localGallery} profilePerson={profilePerson} sharedProfiles={sharedProfiles} admin={admin} guest={guest} route={screen} query={query} setQuery={setQuery} />}</main>)}</div></div>
    <footer><span><i /> kirari <span className="footer-divider">/</span> 켄지 & 키요</span><div className="admin-login-bar"><AdminLogin onAdminChange={onAdminChange} /></div></footer>
    {admin && route === 'home' && settings && editing && <div className="settings-panel widget" id="appearance-settings">
      <WidgetTitle icon={<Palette size={16} />} action={<button className="bare" aria-label="설정 닫고 취소" disabled={shared.saving} onClick={cancelSettings}><X size={16} /></button>}>공용 화면 편집</WidgetTitle>
      <p>일러스트·D-day·배치는 모든 방문자에게 공개됩니다.</p>
      <fieldset className="appearance-fields" disabled={shared.saving}>
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
      <button className="soft-button reset-widget-positions" disabled={!shared.ready} onClick={() => setWidgetPositions(shared.published.positions)}>위젯 위치 초기화</button>
      <small>데스크톱에서 위젯을 드래그하거나 방향키로 이동하세요. 모바일은 기본 배치를 유지합니다.</small>
      </fieldset>
      <div className="appearance-actions"><button className="primary-button" disabled={shared.saving || !shared.ready} onClick={async () => { if (await shared.save()) { setLocalPositions(null); setSettings(false); settingsToggle.current?.focus() } }}>{shared.saving ? '저장 중…' : '모두에게 적용 · 저장'}</button><button className="soft-button" disabled={shared.saving} onClick={cancelSettings}>편집 취소</button></div>
      <small>저장 전에는 내 화면에서만 미리 보입니다. 창을 연 채 위젯을 배치하세요. X·Esc·편집 취소 또는 다른 화면으로 이동하면 변경을 버립니다.</small>
      <p role="status">{shared.status}</p>
    </div>}

    {editing && <div className="editing-banner" role="status">공용 화면 편집 중 · 아직 저장되지 않았습니다</div>}
    <div className="youtube-player" ref={musicHost} aria-hidden="true" />
    <LiquidTransition ref={transition} />
  </div>
}
