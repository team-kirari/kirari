import { useEffect, useRef, useState } from 'react'
import { useSelectionIndicator } from './useSelectionIndicator'
import { useGalleryReveal } from './useGalleryReveal'
import { ImagePlus, Search, X } from 'lucide-react'
import { copyrightLabel } from '../lib/gallery-catalog'
import { sortGalleryByCredit } from '../lib/gallery'
import { galleryGroups } from '../lib/gallery-storage'
import type { GalleryImage } from '../lib/gallery-storage'
import type { useGallery } from '../lib/useGallery'
import { PhotoUpload } from './PhotoUpload'
import './ArchiveScreens.css'

type Mode = '전체보기' | '태그' | '앨범'
export function GalleryScreen({ query, setQuery, admin, gallery }: { query: string, setQuery: (value: string) => void, admin: boolean, gallery: ReturnType<typeof useGallery> }) {
  const [mode, setMode] = useState<Mode>('전체보기')
  const [group, setGroup] = useState('')
  const filterNavigation = useSelectionIndicator<HTMLDivElement>(mode)
  const [selected, setSelected] = useState<GalleryImage | null>(null)
  const [editing, setEditing] = useState(false)
  const [editItem, setEditItem] = useState<GalleryImage | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [tags, setTags] = useState('')
  const [album, setAlbum] = useState('')
  const [credit, setCredit] = useState('')
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const editor = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (!admin) editor.current?.close() }, [admin])
  const groups = mode === '전체보기' ? [] : galleryGroups(gallery.items, mode)
  const activeGroup = groups.includes(group) ? group : ''
  const items = sortGalleryByCredit(gallery.items.filter(item => (!activeGroup || (mode === '태그' ? item.tags.includes(activeGroup) : (item.album || '미분류') === activeGroup)) && `${item.title} ${item.album} ${item.tags.join(' ')} ${item.credit}`.toLowerCase().includes(query.toLowerCase())))
  const visibleIds = new Set(items.map(item => item.id))
  const grid = useGalleryReveal(JSON.stringify(gallery.items.map(item => [item.id, item.src])), `${mode}:${activeGroup}:${query}`)
  function open(item: GalleryImage) { setSelected(item); setDeleting(false); dialog.current?.showModal() }
  function edit(item: GalleryImage) {
    dialog.current?.close(); setEditItem(item); setEditing(true); setTags(item.tags.join(', ')); setAlbum(item.album); setCredit(item.credit); setError(''); editor.current?.showModal()
  }
  async function saveMetadata() {
    if (!admin || gallery.busy) return
    if (!editItem) return
    const parsedTags = [...new Set(tags.split(/[,，]/).map(tag => tag.trim().replace(/^#/, '')).filter(Boolean))]
    if (parsedTags.length > 20 || parsedTags.some(tag => tag.length > 40)) { setError('태그는 20개 이하, 각각 40자 이하로 입력해 주세요.'); return }
    setError('')
    const metadata = { title: editItem.title, tags: parsedTags, album: album.trim(), credit: credit.trim() }
    if (await gallery.edit(editItem, metadata)) editor.current?.close()
  }
  return <>
    {admin && <div className="archive-toolbar"><div className="archive-editor-actions">
<PhotoUpload items={gallery.items} />
</div></div>}
    <div className="gallery-tools">
<div ref={filterNavigation} className="filter-tabs selection-track" aria-label="갤러리 분류"><span className="selection-indicator" aria-hidden="true" />{(['전체보기', '태그', '앨범'] as const).map(value => <button key={value} aria-pressed={mode === value} onClick={() => { setMode(value); setGroup('') }}>{value}</button>)}</div>
<label className="inline-search">
<Search size={16} />
<input aria-label="갤러리 검색" maxLength={120} placeholder="그림 찾기…" value={query} onChange={event => setQuery(event.target.value)} />
</label>
<span className="result-count">{items.length}개의 그림</span>
</div>
    {mode !== '전체보기' && <div className="gallery-groups" aria-label={`${mode} 선택`}>
<button aria-pressed={!activeGroup} onClick={() => setGroup('')}>{mode} 전체</button>{groups.map(value => <button key={value} aria-pressed={activeGroup === value} onClick={() => setGroup(value)}>{mode === '태그' ? '#' : ''}{value}<small>{gallery.items.filter(item => mode === '태그' ? item.tags.includes(value) : (item.album || '미분류') === value).length}</small>
</button>)}{!groups.length && <span>그림을 등록하면 {mode === '태그' ? '태그가' : '앨범이'} 여기에 표시돼요.</span>}</div>}
    <p role="status" className="archive-status">{gallery.status}</p>{admin && <p className="archive-status">{gallery.sharedStatus}</p>}
    <div ref={grid} hidden={!items.length} className="gallery-grid gallery-masonry">{sortGalleryByCredit(gallery.items).map(item => <button className="gallery-item" hidden={!visibleIds.has(item.id)} key={`${item.id}:${item.src}`} aria-label={`${item.title} 크게 보기`} onClick={() => open(item)}>
<div className="gallery-image">
<img data-src={item.src} alt={item.title} decoding="async" onLoad={event => { event.currentTarget.closest('.gallery-item')?.setAttribute('data-loaded', 'true') }} onError={event => { event.currentTarget.closest('.gallery-item')?.setAttribute('data-loaded', 'error') }} />
</div>
<div className="gallery-caption">
<div>
<span>{item.tags.map(tag => `#${tag}`).join(' ')}</span>
{item.credit && <span className="gallery-credit">{copyrightLabel(item.credit)}</span>}
</div>
<span className="category-tag">{item.album || '미분류'}</span>
</div>
</button>)}</div>{!items.length && <div className="empty-state">
<ImagePlus size={32} />
<h2>{gallery.items.length ? '찾는 그림이 없어요' : '새로운 그림을 기다리고 있어요'}</h2>
<p>{gallery.items.length ? '다른 태그나 앨범을 선택해 보세요.' : '관리자로 로그인한 뒤 첫 그림을 등록해 주세요.'}</p>{gallery.items.length > 0 && <button className="soft-button" onClick={() => { setQuery(''); setGroup(''); setMode('전체보기') }}>전체 그림 보기</button>}</div>}
    <dialog ref={dialog} className="art-dialog" aria-label="그림 크게 보기" onClose={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}>
<div className="dialog-inner">
<button className="dialog-close icon-button" aria-label="이미지 닫기" onClick={() => dialog.current?.close()}>
<X size={20} />
</button>{selected && <>
<img src={selected.src} alt={selected.title} />
<div>
<span>{copyrightLabel(selected.credit)}</span>
</div>
<div>{selected.album || '미분류'} · {selected.tags.map(tag => `#${tag}`).join(' ')}</div>{admin && <div>
<button className="soft-button" disabled={gallery.busy || !gallery.sharedReady} onClick={() => edit(selected)}>그림 정보 편집</button>
<button className="soft-button" disabled={gallery.busy || !gallery.sharedReady} onClick={() => setDeleting(!deleting)}>공용 갤러리에서 숨기기</button>
{deleting && <><span>갤러리에서 숨길까요? 배포 파일은 남습니다.</span><button className="soft-button" disabled={gallery.busy} onClick={() => void gallery.edit(selected, selected, true).then(ok => { if (ok) dialog.current?.close() })}>확인</button></>}
</div>}</>}</div>
</dialog>
    <dialog ref={editor} className="archive-editor" aria-label="그림 정보 편집" onClose={() => setEditing(false)} onCancel={event => { if (gallery.busy) event.preventDefault() }}>{editing && admin && <form onSubmit={event => { event.preventDefault(); void saveMetadata() }}>
<h2>그림 정보 편집</h2>
<p>태그·앨범·저작권자를 저장하면 모든 방문자에게 반영돼요.</p>
<fieldset disabled={gallery.busy}>
<label>태그<input maxLength={820} placeholder="켄지, 키요, 페어 (쉼표로 구분)" value={tags} onChange={event => setTags(event.target.value)} />
</label>
<label>앨범<input maxLength={80} placeholder="예: 첫 데이트" value={album} onChange={event => setAlbum(event.target.value)} />
</label>
<label>저작권자<input maxLength={120} placeholder="이름만 입력해 주세요" value={credit} onChange={event => setCredit(event.target.value)} />
</label>
{credit.trim() && <p>표시: {copyrightLabel(credit)}</p>}
<div className="archive-editor-actions">
<button className="primary-button" type="submit">{gallery.busy ? '저장 중…' : '공개 저장'}</button>
<button type="button" className="soft-button" onClick={() => editor.current?.close()}>취소</button>
</div>
</fieldset>
<p role="alert">{error}</p>
<p role="status">{gallery.status}</p>
</form>}</dialog>
  </>
}
