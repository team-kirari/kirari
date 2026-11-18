import { useEffect, useState } from 'react'
import { LockKeyhole, Search } from 'lucide-react'
import { readList } from '../lib/story-api'
import { listTrpgLogs } from '../lib/trpg-log-api'
import { searchCategories, searchRecords } from '../lib/search'
import { copyrightLabel } from '../lib/gallery-catalog'
import { storyDate } from '../lib/stories'
import { LogImage } from './TrpgRichText'
import type { SearchCategory } from '../lib/search'
import type { StorySummary } from '../lib/stories'
import type { LogSummary } from '../lib/trpg-log-summary'
import type { useGallery } from '../lib/useGallery'
import './StoryScreen.css'
import './TrpgLogScreen.css'
import './SearchScreen.css'

export function SearchScreen({ query, gallery }: { query: string, gallery: ReturnType<typeof useGallery> }) {
  const [stories, setStories] = useState<StorySummary[]>([])
  const [logs, setLogs] = useState<LogSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [attempt, setAttempt] = useState(0)
  const [category, setCategory] = useState<SearchCategory | '전체'>('전체')
  useEffect(() => {
    let active = true
    // Unauthenticated lists contain exactly the metadata visitors may already see.
    void Promise.allSettled([readList(false), listTrpgLogs(false)]).then(([storyResult, logResult]) => {
      if (!active) return
      setStories(storyResult.status === 'fulfilled' ? storyResult.value : [])
      setLogs(logResult.status === 'fulfilled' ? logResult.value : [])
      setErrors([...(storyResult.status === 'rejected' ? ['이야기 목록을 불러오지 못했어요.'] : []), ...(logResult.status === 'rejected' ? ['로그 목록을 불러오지 못했어요.'] : [])])
      setLoading(false)
    })
    return () => { active = false }
  }, [attempt])
  const results = searchRecords(query, { gallery: gallery.items, stories, logs })
  const visible = category === '전체' ? results : results.filter(item => item.category === category)
  const photosById = new Map(gallery.items.map(item => [item.id, item]))
  const storiesById = new Map(stories.map(item => [item.id, item]))
  const logsById = new Map(logs.map(item => [item.id, item]))
  const waiting = loading || gallery.loading
  return <div className="global-search">
    <p className="search-scope">갤러리의 태그·앨범·저작권자, 이야기의 제목·작가·날짜, 로그의 제목·날짜를 검색해요.</p>
    <div className="search-filters" role="group" aria-label="검색 결과 분류">
      {(['전체', ...searchCategories] as const).map(value => <button className="soft-button" key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}<span>{value === '전체' ? results.length : results.filter(item => item.category === value).length}</span></button>)}
    </div>
    <p role="status">{!query.trim() ? '상단 검색창에 검색어를 입력해 주세요.' : waiting ? '기록을 불러오는 중…' : `“${query}” 검색 결과 ${visible.length}개`}</p>
    {errors.length > 0 && <div className="search-feedback" role="status"><p>{errors.join(' ')} 불러온 자료에서만 결과를 표시해요.</p><button className="soft-button" disabled={loading} onClick={() => { setLoading(true); setAttempt(value => value + 1) }}>다시 불러오기</button></div>}
    {gallery.status && <p className="search-feedback" role="status">{gallery.status}</p>}
    {searchCategories.map(group => {
      const items = visible.filter(item => item.category === group)
      if (!items.length) return null
      return <section className="search-result-group" key={group} aria-label={`${group} 검색 결과`}>
        <h2 className="search-group-title">{group}<span>{items.length}</span></h2>
        {group === '갤러리' && <ul className="search-photo-grid">{items.map(item => {
          const photo = photosById.get(item.id)!
          return <li key={item.id}><a className="search-photo" href={item.href} aria-label={`${photo.title} 크게 보기`}>
            <span className="search-photo-image"><img src={photo.src} alt={photo.title} loading="lazy" decoding="async" onError={event => { event.currentTarget.hidden = true; event.currentTarget.nextElementSibling?.removeAttribute('hidden') }} /><small hidden>이미지를 불러오지 못했어요.</small></span>
            <span className="search-photo-caption">{photo.tags.length > 0 && <span>{photo.tags.map(tag => `#${tag}`).join(' ')}</span>}{photo.credit && <span>{copyrightLabel(photo.credit)}</span>}{photo.album && <span className="category-tag">{photo.album}</span>}</span>
          </a></li>
        })}</ul>}
        {group === '이야기' && <div className="story-list search-story-list">{items.map(item => {
          const story = storiesById.get(item.id)!
          const date = storyDate(story)
          return <article key={item.id}><a className="story-list-open" href={item.href}><span>{story.protected && <LockKeyhole size={14} aria-label="잠긴 글" />}<strong>{story.title}</strong></span><small>{story.author && `w. ${story.author} · `}<time dateTime={date}>{date.replaceAll('-', '.')}</time></small></a></article>
        })}</div>}
        {group === '로그' && <div className="trpg-log-list">{items.map(item => {
          const log = logsById.get(item.id)!
          return <article key={item.id}><a className="trpg-log-card" href={item.href}><span className="trpg-log-thumbnail">{log.preview ? <><LogImage key={log.preview} src={log.preview} alt={`${log.title} 시작 장면 미리보기`} /><small hidden>미리보기 없음</small></> : <small>미리보기 없음</small>}</span><span className="trpg-log-info"><strong>{log.title}</strong>{log.logDate ? <time dateTime={log.logDate}>{log.logDate.replaceAll('-', '.')}</time> : <small>날짜 정보 없음</small>}</span></a></article>
        })}</div>}
      </section>
    })}
    {!visible.length && query.trim() && !waiting && <div className="empty-state"><Search size={28} /><h2>{errors.length ? '불러온 자료에 검색 결과가 없어요' : '검색 결과가 없어요'}</h2><p>다른 검색어나 분류를 선택해 보세요.</p></div>}
  </div>
}
