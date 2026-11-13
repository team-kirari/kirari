import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { BookOpen, Check, ChevronLeft, ChevronRight, Diamond, Image as ImageIcon, Pencil, Quote, RefreshCw, Sparkles, X } from 'lucide-react'
import { art, gallery } from '../content'
import { personalityTags, profileAge, profileFullName, profileFields } from '../lib/profiles'
import type { CharacterProfile, PersonId, ProfileField, PhotoSelection } from '../lib/profiles'
import { profileIllustrations, versionLabels } from '../lib/profile-illustrations'
import type { IllustrationVersion } from '../lib/profile-illustrations'
import type { useSharedProfiles } from '../lib/useSharedProfiles'
import { pickProfileImage, selectedProfileImages } from '../lib/profile-images'
import { appearanceGallery } from '../lib/gallery'
import { cardFlipFrames } from '../lib/card-flip'
import { illustrationOrbitFrames } from '../lib/illustration-orbit'
import './ProfileScreen.css'

const people = ['kenji', 'kiyo'] as const
const portraits = { kenji: art.kenji, kiyo: art.kiyo }
const illustrations = { kenji: [art.kenji, art.kenjiSD], kiyo: [art.kiyo, art.kiyoSD] }
const identity = { kenji: { name: '켄지' }, kiyo: { name: '키요' } }
const tabs = ['성격', '외형', '취향'] as const
const illustrationVersions = Object.keys(versionLabels) as IllustrationVersion[]
const editorGroups: { title: string, fields: ProfileField[] }[] = [
  { title: '기본 정보', fields: ['surname', 'name', 'originalName', 'gender', 'age', 'birthday', 'height', 'weight', 'color', 'quote', 'tags'] },
  { title: '외형', fields: ['appearance', 'impression', 'outfit', 'symbol'] },
  { title: '성격', fields: ['beliefs', 'outside', 'inside', 'strengths', 'weaknesses', 'goals', 'fears'] },
  { title: '취향', fields: ['likes', 'dislikes'] },
]

function Entry({ profile, field, label }: { profile: CharacterProfile, field: ProfileField, label?: string }) {
  return <div className={`dossier-entry ${profile[field] ? '' : 'is-empty'}`}><dt>{label ?? profileFields[field]}</dt><dd>{profile[field] || '아직 작성하지 않았어요.'}</dd></div>
}


function PersonalityCard({ profile }: { profile: CharacterProfile }) {
  const [cardTurn, setCardTurn] = useState(0)
  const [flipping, setFlipping] = useState(false)
  const [hoverReady, setHoverReady] = useState(true)
  const inner = Math.abs(cardTurn % 2) === 1
  const rotor = useRef<HTMLDivElement>(null)
  const motion = useRef<Animation | null>(null)
  useEffect(() => () => {
    if (motion.current) { motion.current.onfinish = null; motion.current.cancel() }
  }, [])
  function pressSide(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse') return
    const bounds = event.currentTarget.getBoundingClientRect()
    const position = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1))
    event.currentTarget.style.setProperty('--card-press-angle', `${position * 7}deg`)
  }
  function flip(direction: -1 | 1) {
    if (!rotor.current || motion.current) return
    const from = cardTurn * 180
    setHoverReady(false)
    setCardTurn(value => value + direction)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const animation = rotor.current.animate(cardFlipFrames(from, direction), { duration: 560, easing: 'linear' })
    motion.current = animation
    setFlipping(true)
    animation.onfinish = () => { motion.current = null; setFlipping(false) }
  }
  return (
        <div className={`personality-card ${flipping ? 'is-flipping' : ''}`} data-hover-ready={hoverReady} onPointerEnter={event => { if (!motion.current) setHoverReady(true); pressSide(event) }} onPointerMove={pressSide} onPointerLeave={event => event.currentTarget.style.removeProperty('--card-press-angle')}>
          <button className="personality-flip-button flip-left" onClick={() => flip(-1)} aria-label={`${inner ? '겉모습' : '내면'}으로 왼쪽 뒤집기`} title="왼쪽으로 뒤집기" aria-disabled={flipping} aria-controls="personality-card-body"><ChevronLeft size={18} /></button>
          <div className="personality-card-perspective" id="personality-card-body">
            <div className="personality-card-hover"><div ref={rotor} className="personality-card-turner" style={{ transform: `rotateY(${cardTurn * 180}deg)` }}>
              {(['outside', 'inside'] as const).map(side => {
                const isInside = side === 'inside'
                const visible = inner === isInside
                return <section key={side} className={`personality-card-face ${isInside ? 'card-back' : 'card-front'}`} aria-hidden={!visible} inert={!visible} aria-label={isInside ? '내면' : '겉모습'}>
                  <h3>{isInside ? '내면' : '겉모습'}</h3>
                  <p className={profile[side] ? '' : 'is-empty'}>{profile[side] || (isInside ? '겉으로는 알 수 없는 마음을 채워 주세요.' : '다른 사람에게 보이는 모습을 채워 주세요.')}</p>
                </section>
              })}
            </div></div>
          </div>
          <button className="personality-flip-button flip-right" onClick={() => flip(1)} aria-label={`${inner ? '겉모습' : '내면'}으로 오른쪽 뒤집기`} title="오른쪽으로 뒤집기" aria-disabled={flipping} aria-controls="personality-card-body"><ChevronRight size={18} /></button>
        </div>
  )
}

function CharacterEntrance({ person, profile, photoSelection, version, onVersionChange }: {
  person: PersonId, profile: CharacterProfile, photoSelection: PhotoSelection, version: IllustrationVersion,
  onVersionChange: (version: IllustrationVersion) => void,
}) {
  const photos = { old: selectedProfileImages(profileIllustrations[person].old, photoSelection.old), new: selectedProfileImages(profileIllustrations[person].new, photoSelection.new) }
  const [chosen, setChosen] = useState(() => Object.fromEntries(illustrationVersions.map(value => [
    value, pickProfileImage(photos[value].length ? photos[value].map(photo => photo.url) : illustrations[person])!,
  ])) as Record<IllustrationVersion, string>)
  const [ready, setReady] = useState({ old: false, new: false })
  const [failed, setFailed] = useState({ old: false, new: false })
  const [hasSwitched, setHasSwitched] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(true)
  const [orbit, setOrbit] = useState<{ from: IllustrationVersion, to: IllustrationVersion } | null>(null)
  const layers = useRef<Partial<Record<IllustrationVersion, HTMLDivElement | null>>>({})
  const nextVersion = illustrationVersions[(illustrationVersions.indexOf(version) + 1) % illustrationVersions.length]
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useLayoutEffect(() => {
    if (!orbit) return
    const animations = [orbit.from, orbit.to].flatMap(value => {
      const layer = layers.current[value]
      return layer ? [layer.animate(illustrationOrbitFrames(value === orbit.to), {
        duration: 700, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'both',
      })] : []
    })
    let active = true
    const finish = () => { if (active) setOrbit(null) }
    void Promise.all(animations.map(animation => animation.finished)).then(finish, finish)
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const reduceMotion = () => { if (preference.matches) finish() }
    preference.addEventListener('change', reduceMotion)
    return () => {
      active = false
      preference.removeEventListener('change', reduceMotion)
      animations.forEach(animation => animation.cancel())
    }
  }, [orbit])
  async function changeVersion(value: IllustrationVersion) {
    if (value === version || orbit || pending.current) return
    pending.current = true
    setPreparing(true)
    try {
      const source = pickProfileImage(photos[value].length ? photos[value].map(photo => photo.url) : illustrations[person])!
      const image = new Image()
      image.src = source
      let failed = false
      try { await image.decode() } catch {
        failed = true
        image.src = portraits[person]
        // The visible image error handler also reports a failed fallback.
        try { await image.decode() } catch { /* Keep the fallback and its error notice. */ }
      }
      if (!mounted.current) return
      setChosen(previous => ({ ...previous, [value]: image.src }))
      setFailed(previous => ({ ...previous, [value]: failed }))
      setReady(previous => ({ ...previous, [value]: true }))
      setHasSwitched(true)
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setOrbit({ from: version, to: value })
      onVersionChange(value)
    } finally {
      pending.current = false
      if (mounted.current) setPreparing(false)
    }
  }
  return <div className="entrance-stage" aria-label={`${profileFullName(profile)} 캐릭터 일러스트`} aria-busy={!ready[version]}>
    <span className="entrance-rail" aria-hidden="true" />
    <div className={`entrance-orbit ${hasSwitched ? 'has-switched' : ''} ${orbit ? 'is-orbiting' : ''}`}>
      {illustrationVersions.map(value => {
        const active = value === version
        const source = failed[value] ? portraits[person] : chosen[value]
        return <div key={value} ref={element => { layers.current[value] = element }} className={`entrance-art ${ready[value] ? 'is-ready' : ''} ${active ? 'is-active' : ''} ${orbit?.from === value ? 'is-departing' : ''}`} aria-hidden={!active}>
          <img className="entrance-art-shadow" src={source} alt="" aria-hidden="true" />
          <img className="entrance-art-image" src={source} alt={`${profileFullName(profile)} ${versionLabels[value]}${photos[value].length ? '' : ' 미등록 · 임시 기본 그림'}`} onLoad={() => setReady(previous => ({ ...previous, [value]: true }))} onError={() => {
            setFailed(previous => ({ ...previous, [value]: true }))
            setReady(previous => ({ ...previous, [value]: true }))
          }} />
        </div>
      })}
    </div>
    <div className="entrance-art-footer">
      <button type="button" className="illustration-version-switch" aria-label={`${profileFullName(profile)}, 현재 ${versionLabels[version]}, 다음 일러스트로 전환`} title="다음 일러스트로 전환" disabled={!!orbit || preparing} aria-busy={preparing} onClick={() => void changeVersion(nextVersion)}>
        <span aria-live="polite">{versionLabels[version]}</span>
        <RefreshCw size={12} aria-hidden="true" />
      </button>
      {(!photos[version].length || failed[version]) && <div className="entrance-art-caption" role="status">{failed[version] ? '이미지를 읽지 못해 기본 그림을 표시해요.' : '선택된 사진 없음 · 임시 기본 그림'}</div>}
    </div>
  </div>
}

function ProfileEditor({ person, profile, photoSelection, onApply, onClose }: {
  person: PersonId, profile: CharacterProfile, photoSelection: PhotoSelection,
  onApply: (value: CharacterProfile, selection: PhotoSelection) => Promise<void>, onClose: () => void,
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState({ ...profile })
  const [selection, setSelection] = useState<PhotoSelection>(() => ({ old: { ...photoSelection.old }, new: { ...photoSelection.new } }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  const busy = saving
  useEffect(() => {
    alive.current = true
    const element = dialog.current
    const previous = document.activeElement as HTMLElement | null
    element?.showModal()
    return () => { alive.current = false; element?.close(); previous?.focus() }
  }, [])
  async function apply() {
    if (busy) return
    setSaving(true); setError('')
    try {
      await onApply({ ...draft, color: draft.color.toUpperCase() }, selection)
      if (alive.current) onClose()
    } catch (cause) { if (alive.current) { setError(cause instanceof Error ? cause.message : '프로필을 저장하지 못했어요.'); setSaving(false) } }
  }
  return <dialog className="dossier-editor" ref={dialog} aria-labelledby="profile-editor-title" onCancel={event => { if (busy) event.preventDefault(); else onClose() }}>
    <form onSubmit={event => { event.preventDefault(); void apply() }}>
      <header><div><small>프로필 편집</small><h2 id="profile-editor-title">{identity[person].name}의 프로필</h2></div><button type="button" className="icon-button" disabled={busy} aria-label="편집 취소" onClick={onClose}><X size={18} /></button></header>
      <p className="dossier-editor-notice">저장하면 모든 방문자에게 공개돼요. 사진은 갤러리의 ‘사진 등록’에서 마스터키로 등록하고 자동 배포가 끝나면 선택할 수 있어요.</p>
      {error && <p className="profile-photo-status is-error" role="alert">{error}</p>}
      {illustrationVersions.map(value => <fieldset key={value} className="profile-photo-editor" disabled={busy}>
        <legend>{versionLabels[value]} · 등장 사진 선택</legend>
        <p>체크한 사진 중에서만 무작위로 표시돼요. 선택하지 않으면 임시 기본 그림을 사용해요.</p>
        <div className="profile-photo-actions">
          <button type="button" className="soft-button" onClick={() => setSelection(previous => ({ ...previous, [value]: Object.fromEntries(profileIllustrations[person][value].map(photo => [photo.name, true])) }))}>전체 선택</button>
          <button type="button" className="soft-button" onClick={() => setSelection(previous => ({ ...previous, [value]: {} }))}>선택 해제</button>
          <span>{selectedProfileImages(profileIllustrations[person][value], selection[value]).length}장 선택</span>
        </div>
        <div className="profile-photo-grid">{profileIllustrations[person][value].map(photo => <label className="profile-photo-tile profile-photo-option" key={photo.name}>
          <img src={photo.url} alt="" loading="lazy" />
          <span title={photo.name}>{photo.name}</span>
          <span className="profile-photo-check"><input type="checkbox" checked={Object.hasOwn(selection[value], photo.name)} onChange={event => {
            const checked = event.target.checked
            setSelection(previous => {
              const next = { ...previous[value] }
              if (checked) Object.defineProperty(next, photo.name, { value: true, enumerable: true, configurable: true, writable: true })
              else delete next[photo.name]
              return { ...previous, [value]: next }
            })
          }} />등장에 사용</span>
        </label>)}</div>
        {!profileIllustrations[person][value].length && <p>등록된 사진이 없어요.</p>}
      </fieldset>)}
      {editorGroups.map(group => <fieldset key={group.title} disabled={busy}><legend>{group.title}</legend><div className="dossier-edit-grid">{group.fields.map(field => <label key={field} className={['quote', 'tags', 'outside', 'inside'].includes(field) ? 'wide' : ''}>{profileFields[field]}
        {field === 'color' ? <input value={draft[field]} pattern="#[0-9a-fA-F]{6}" maxLength={7} required title="#으로 시작하는 6자리 HEX 코드" onChange={event => setDraft({ ...draft, [field]: event.target.value })} />
          : ['height', 'weight'].includes(field) ? <input type="number" min={1} max={500} step={0.1} value={draft[field]} onChange={event => setDraft({ ...draft, [field]: event.target.value })} />
          : ['surname', 'name', 'originalName', 'gender', 'birthday', 'age', 'address'].includes(field) ? <input value={draft[field]} maxLength={80} required={field === 'name'} pattern={field === 'name' ? '.*\\S.*' : undefined} title={field === 'name' ? '공백이 아닌 이름을 입력해 주세요' : undefined} onChange={event => setDraft({ ...draft, [field]: event.target.value })} />
          : <textarea value={draft[field]} rows={field === 'tags' ? 2 : 3} maxLength={field === 'tags' ? 160 : 1200} placeholder={field === 'tags' ? '쉼표로 구분해 주세요. 최대 8개 표시' : undefined} onChange={event => setDraft({ ...draft, [field]: event.target.value })} />}
      </label>)}</div></fieldset>)}
      <div className="dossier-editor-actions"><button type="button" className="soft-button" disabled={busy} onClick={onClose}>취소</button><button className="primary-button" type="submit" disabled={busy}><Check size={15} />{saving ? '저장 중…' : '공용으로 저장'}</button></div>
    </form>
  </dialog>
}

export function ProfileScreen({ admin, shared, initialPerson }: { initialPerson: PersonId, admin: boolean, shared: ReturnType<typeof useSharedProfiles> }) {
  const { profiles } = shared
  const [selected, setSelected] = useState<PersonId>(initialPerson)
  const [tab, setTab] = useState<typeof tabs[number]>('성격')
  const [outfit, setOutfit] = useState(0)
  const [editing, setEditing] = useState<{ person: PersonId, revision: number } | null>(null)
  const profile = profiles[selected]
  const [version, setVersion] = useState<IllustrationVersion>('new')
  const appearanceItems = appearanceGallery(gallery, selected, [
    ...illustrations[selected],
    ...illustrationVersions.flatMap(value => profileIllustrations[selected][value].map(photo => photo.url)),
  ])
  const appearanceItem = appearanceItems[outfit] ?? appearanceItems[0]
  const select = (person: PersonId) => {
    if (person === selected) return
    setSelected(person)
    setOutfit(0)
  }
  const tags = personalityTags(profile.tags)
  return <div className="character-dossier" data-person={selected}>

    {shared.status && <p className="profile-photo-status" role="status">{shared.status}</p>}
    <div className="character-stage-shell">
      <div className="character-select" role="group" aria-label="프로필을 볼 캐릭터 선택">
        {people.filter(person => person !== selected).map(person => <button key={person} className={`character-choice choice-${person}`} aria-label={`${profiles[person].name} 프로필 보기`} title={`${profiles[person].name} 프로필 보기`} aria-pressed={selected === person} onClick={() => select(person)}>
          {person === 'kenji' ? <ChevronLeft size={17} aria-hidden="true" /> : <ChevronRight size={17} aria-hidden="true" />}<span>{profiles[person].name}</span>
        </button>)}
      </div>
    <section key={selected} className="dossier-main" data-person={selected} aria-label={`${profileFullName(profile)} 상세 프로필`}>
      <div className="entrance-color-sweep" aria-hidden="true" /><div className="entrance-color-echo" aria-hidden="true" />
      <CharacterEntrance key={`${selected}-${shared.revisions[selected]}`} person={selected} profile={profile} photoSelection={shared.photoSelections[selected]} version={version} onVersionChange={setVersion} />
      <div className="dossier-identity" key={selected}>
        <div className="identity-heading"><div><span className="dossier-eyebrow">캐릭터 프로필</span><h2>{profile.surname && <><span className="identity-surname">{profile.surname}</span>{' '}</>}<span className="identity-given-name">{profile.name}</span></h2><p>{profile.originalName || '한자 이름을 기다리고 있어요'}</p></div>{admin && <button className="dossier-edit-button" disabled={!shared.ready} onClick={() => setEditing({ person: selected, revision: shared.revisions[selected] })}><Pencil size={13} /> {identity[selected].name} 편집</button>}</div>
        <blockquote className={`character-quote ${profile.quote ? '' : 'is-empty'}`}><Quote size={22} aria-hidden="true" /><p>{profile.quote || '이곳에 한마디를 남겨 주세요.'}</p><span aria-hidden="true">”</span></blockquote>
        <div className="dossier-tags" aria-label="핵심 성격 해시태그">{tags.length ? tags.map(tag => <span key={tag}>#{tag}</span>) : <span className="is-empty">#아직_정해지지_않은_성격</span>}</div>
        <dl className="identity-stats">{(['gender', 'age', 'birthday', 'height', 'weight'] as const).map(field => <div key={field}><dt>{profileFields[field].replace(/ \(.+\)/, '')}</dt><dd>{field === 'age' ? profileAge(profile.age) : profile[field] ? `${profile[field]}${field === 'height' ? ' cm' : field === 'weight' ? ' kg' : ''}` : '—'}</dd></div>)}</dl>
        <div className="identity-color"><span className="character-color-chip" style={{ backgroundColor: profile.color }} /><span>대표 컬러</span><code>{profile.color}</code></div>
      </div>
    </section>

    </div>

    <div className="dossier-section-nav" role="group" aria-label="프로필 세부 항목">{tabs.map((value, index) => { const Icon = [Sparkles, ImageIcon, BookOpen][index]; return <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}><Icon size={15} />{value}</button> })}</div>
    <section key={`${selected}-${tab}`} className="dossier-details" aria-label={`${profileFullName(profile)}의 ${tab}`}>
      {tab === '성격' && <div className="personality-layout">
        <PersonalityCard key={selected} profile={profile} />
        <dl className="personality-grid"><div className="belief-entry"><Diamond size={20} /><Entry profile={profile} field="beliefs" /></div><Entry profile={profile} field="strengths" /><Entry profile={profile} field="weaknesses" /><Entry profile={profile} field="goals" /><Entry profile={profile} field="fears" /></dl>
      </div>}
      {tab === '외형' && <div className="appearance-layout"><div className="outfit-gallery">
        {appearanceItem ? <><div className="outfit-image"><img src={appearanceItem.src} alt={appearanceItem.title} /></div>
          <div className="outfit-thumbnails" role="group" aria-label="외형 참고 이미지">{appearanceItems.map((item, index) => <button key={item.id} aria-label={`${item.title} 보기`} aria-pressed={appearanceItem.id === item.id} onClick={() => setOutfit(index)}><img src={item.src} alt="" /></button>)}<span>{appearanceItems.indexOf(appearanceItem) + 1} / {appearanceItems.length}</span></div>
        </> : <p className="outfit-empty">해당 캐릭터가 태그된 갤러리 그림이 없어요.</p>}
      </div><dl className="appearance-entries">{(['appearance', 'impression', 'outfit', 'symbol'] as const).map(field => <Entry key={field} profile={profile} field={field} />)}</dl></div>}
      {tab === '취향' && <dl className="preferences-grid">{(['likes', 'dislikes'] as const).map(field => <Entry key={field} profile={profile} field={field} />)}</dl>}
    </section>
    {admin && editing && <ProfileEditor key={editing.person} person={editing.person} profile={profiles[editing.person]} photoSelection={shared.photoSelections[editing.person]} onApply={(value, selection) => shared.save(editing.person, value, selection, editing.revision)} onClose={() => setEditing(null)} />}

  </div>
}
