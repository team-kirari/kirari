import { useEffect, useState } from 'react'
import { CalendarHeart } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { dDayLabel, seoulDate } from '../lib/dday'
import type { DDay } from '../lib/dday'

export function DDayWidget({ items }: { items: DDay[] }) {
  const [today, setToday] = useState(seoulDate)
  useEffect(() => {
    const update = () => setToday(seoulDate())
    const timer = window.setInterval(update, 30000)
    document.addEventListener('visibilitychange', update)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update) }
  }, [])
  return <section className="widget dday-widget" data-widget-id="dday" aria-label="D-day 모음">
    <div className="dday-title"><span><CalendarHeart size={14} />D-day</span></div>
    <div className="dday-list" tabIndex={0} aria-label="D-day 항목">
      {items.map(item => {
        const label = dDayLabel(item.date, today)
        return <div className="dday-row" key={item.id}>
          <div><span className="dday-name">{item.title || 'D-day'}</span><span className="dday-date">{label ? item.date.replaceAll('-', '.') : '옵션에서 날짜 설정'}</span></div>
          <strong>{label || 'D—'}</strong>
        </div>
      })}
      {items.length === 0 && <p className="dday-empty">옵션에서 D-day를 추가해 주세요.</p>}
    </div>
  </section>
}

export function DDaySettings({ items, setItems }: { items: DDay[], setItems: Dispatch<SetStateAction<DDay[]>> }) {
  function change(id: string, field: 'title' | 'date', value: string) {
    setItems(previous => previous.map(item => item.id === id ? { ...item, [field]: value } : item))
  }
  return <section className="dday-settings" aria-label="D-day 설정">
    <div className="dday-settings-heading"><span>D-day 항목 <small>{items.length}개</small></span><button className="soft-button" onClick={() => setItems(previous => [...previous, { id: crypto.randomUUID(), title: 'D-day', date: '' }])}>추가 +</button></div>
    <p>추가한 항목은 하나의 위젯 안에 아래로 쌓여요.</p>
    {items.length === 0 && <p className="dday-no-items">추가를 눌러 첫 D-day를 설정해 주세요.</p>}
    {items.map((item, index) => <div className="dday-setting-item" key={item.id}>
      <div><span>D-day {index + 1}</span><button className="bare" aria-label={`D-day ${index + 1} 삭제`} onClick={() => setItems(previous => previous.filter(value => value.id !== item.id))}>삭제</button></div>
      <label htmlFor={`dday-title-${item.id}`}>이름</label><input id={`dday-title-${item.id}`} value={item.title} maxLength={40} onChange={e => change(item.id, 'title', e.target.value)} />
      <label htmlFor={`dday-date-${item.id}`}>기준일</label><input id={`dday-date-${item.id}`} type="date" min="0001-01-01" max="9999-12-31" value={item.date} onChange={e => change(item.id, 'date', e.target.value)} />
    </div>)}
    <p>다가오는 날은 D−, 지난 날은 D+로 표시해요.<br />한국 시간 기준이며, 당일은 D-DAY예요.</p>
  </section>
}
