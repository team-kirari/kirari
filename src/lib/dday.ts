export type DDay = { id: string, title: string, date: string }

export function seoulDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const value = (key: string) => parts.find(part => part.type === key)!.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

function calendarDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null
  return date.getTime() / 86400000
}

export function dDayLabel(target: string, today: string) {
  const targetDay = calendarDay(target)
  const todayDay = calendarDay(today)
  if (targetDay === null || todayDay === null) return null
  const difference = targetDay - todayDay
  return difference === 0 ? 'D-DAY' : difference > 0 ? `D−${difference}` : `D+${-difference}`
}

