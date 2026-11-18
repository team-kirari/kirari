export type TimelineEvent = {
  id: string
  year: number
  month: number
  day: number
  dateLabel: string
  title: string
  body: string
  revision: number
  deleted: boolean
}

export function parseTimelineEvent(id: string, value: unknown): TimelineEvent | null {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id) || !value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if (Object.keys(data).sort().join(',') !== 'body,dateLabel,day,deleted,month,revision,title,year'
    || !Number.isInteger(data.year) || Number(data.year) < 1 || Number(data.year) > 9999
    || !Number.isInteger(data.month) || Number(data.month) < 1 || Number(data.month) > 12
    || !Number.isInteger(data.day) || Number(data.day) < 0 || Number(data.day) > 31
    || !Number.isSafeInteger(data.revision) || Number(data.revision) < 1
    || typeof data.deleted !== 'boolean'
    || typeof data.dateLabel !== 'string' || data.dateLabel.length > 80
    || typeof data.title !== 'string' || !data.title.trim() || data.title.length > 120
    || typeof data.body !== 'string' || !data.body.trim() || data.body.length > 12000) return null
  const year = Number(data.year), month = Number(data.month), day = Number(data.day)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  if (day > [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]) return null
  return { id, year, month, day, dateLabel: data.dateLabel, title: data.title, body: data.body, revision: Number(data.revision), deleted: data.deleted }
}

export function mergeTimeline(overrides: TimelineEvent[]): TimelineEvent[] {
  const items = new Map(defaultTimeline.map(item => [item.id, item]))
  // Preserve old month-specific edits until the combined event is explicitly saved.
  if (!overrides.some(item => item.id === 'autumn-refrain')) {
    const parts = legacyRefrain.map(seed => overrides.find(item => item.id === seed.id) ?? seed).filter(item => !item.deleted)
    if (parts.length) items.set('autumn-refrain', { ...defaultTimeline[0], body: parts.map(item => `## ${item.month}월\n\n${item.body}`).join('\n\n'), title: parts[0].title })
    else items.delete('autumn-refrain')
  }
  overrides.filter(item => !legacyRefrain.some(seed => seed.id === item.id)).forEach(item => items.set(item.id, item))
  return [...items.values()].filter(item => !item.deleted).sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day || a.id.localeCompare(b.id))
}

const event = (id: string, year: number, month: number, day: number, dateLabel: string, title: string, body: string): TimelineEvent => ({ id, year, month, day, dateLabel, title, body, revision: 0, deleted: false })

const legacyTimeline: TimelineEvent[] = [
  event('refrain-september', 2049, 9, 0, '9월', '가을비의 리프레인', '차가운 가을비가 내리던 어느 날, 켄지는 폐기물 처리장 한편에 버려진 안드로이드를 발견한다. 빗물에 젖은 채 홀로 남겨진 그 모습을 본 켄지는, 언젠가 인간과 안드로이드가 서로의 곁에서 기쁨을 나눌 수 있는 시대가 오기를 바라며 ‘키요’라는 이름을 지어준다.\n\n그렇게 키요는 평가 기간을 거치며 켄지의 임시 파트너 안드로이드로 함께하게 된다. 주어진 시간은 단 한 달. 키요는 그 시간이 끝나기 전에, 자신이 켄지에게 필요한 존재가 되어야 한다고 생각한다.'),
  event('refrain-october', 2049, 10, 0, '10월', '가을비의 리프레인', '소유주와 깊은 유대를 맺은 안드로이드만을 노리는 범죄가 연이어 발생한다. 그리고 폐기물 처리장에 버려져 있던 키요 역시 과거 이 사건의 피해자였다는 사실이 밝혀진다.\n\n켄지와 함께 지내며 다시 누군가와 유대를 쌓기 시작한 키요는 결국 또 한 번 범인의 표적이 된다. 자신이 켄지에게 필요한 존재가 되어야 한다는 부담을 안고 있던 키요는, 스스로 미끼가 되어 범인을 끌어내는 것이 어떻겠느냐고 제안한다. 하지만 켄지는 이를 거절한다. 결국 두 사람은 다른 방법을 찾아 사건을 해결하게 되고, 이 일을 계기로 키요는 더 이상 임시가 아닌, 켄지의 정식 파트너로 인정받게 된다.'),
  event('void', 2050, 9, 0, '9월', 'VOID', '안드로이드에 의한 연쇄 살인 사건과, 안드로이드만을 노린 연쇄 파괴 사건이 동시에 발생한다. 잇따른 사건에 대응하기 위해 공안국 형사과에는 안드로이드 사건을 전담하는 수사계, 통칭 ‘드로과’가 새롭게 설립된다.\n\n켄지와 키요 역시 드로과로 인사이동하게 되고, 그곳에서 새로운 동료들과 만나 조금씩 유대를 쌓아간다. 그러나 사건을 쫓을수록 두 사람은 각자의 과거와 마주하게 된다.'),
  event('loop-de-boo', 2050, 10, 31, '10월 31일 · 할로윈 에피소드', 'LOOP-DE-BOO!', '새로운 근무지에 조금이라도 빨리 적응할 수 있도록, 키요와 동료들은 켄지를 위한 할로윈 깜짝 이벤트를 준비한다. 함께 B급 호러 영화 《12시 13분의 방문자》를 감상하는 척하면서, 영화 속 상황이 현실에서도 반복되는 것처럼 꾸민 가짜 루프를 연출한 것이다.\n\n처음에는 혼란스러워하던 켄지도 장난의 정체를 알게 된 뒤, 결국 웃음을 터뜨린다. 그렇게 모두가 케이크를 나누어 먹으며, 켄지는 새로운 동료들과 잊지 못할 할로윈을 보내게 된다.'),
  event('autumn-warmth', 2050, 11, 0, '11월', '낙엽에도 온기가 있다면', '드로과 동료들과 함께 잠시 일상을 벗어나 가을 산장으로 MT를 떠난다. 이번만큼은 아무런 사건도 없이 편안한 시간을 보낼 수 있으리라 생각했지만, 그 기대는 오래가지 않는다.\n\n산장 근처에서 대량의 안드로이드 잔해가 발견되고, 그것들이 비윤리적인 실험과 연관되어 있다는 사실이 드러난다. 즐거운 여행이 될 거라 믿었던 시간 속에서 켄지와 키요는 안드로이드가 어떤 대우를 받고 있는지, 그리고 그들에게 주어진 권리가 얼마나 불완전한지를 다시금 마주하게 된다.'),
  event('love-qed', 2050, 12, 0, '12월 초입', '사랑증명 Q.E.D', '첫눈이 내리기 전, 차가운 12월의 초입. 켄지와 키요는 한 안드로이드가 인간의 전 재산을 유산으로 상속받은 뒤 자취를 감췄다는 소식을 듣고 그 행방을 쫓기 시작한다. 도주한 안드로이드는 재산을 남긴 인간과 자신이 진심으로 사랑하는 사이였다고 주장한다. 그리고 인간과 안드로이드 사이에도 분명 사랑이 존재했다는 것을 증명하려 한다.\n\n그들의 관계를 따라가며 키요는 자신 안에 자리 잡은 감정을 처음으로 똑바로 마주하게 된다. 켄지를 지키고 싶고, 곁에 있고 싶었던 마음. 이제는 필요로 인한 것이 아니라 그저 함께하고 싶었던 이유가 사랑이었음을 깨닫는다. 사건이 끝난 뒤, 키요는 켄지에게 자신의 마음을 고백한다. 켄지 또한 키요의 마음을 받아들이며, 두 사람은 파트너라는 이름을 넘어서 연인이라는 이름으로 서로를 부르게 된다.'),
  event('our-first-date', 2050, 12, 0, '12월 · 고백으로부터 일주일 뒤', '첫 데이트', '고백으로부터 일주일 뒤, 켄지는 키요에게 첫 데이트를 제안한다. 데이트를 준비하는 일도, 서로를 ‘커플’이라 부르는 것도, 조심스러운 스킨십 하나까지도 두 사람에게는 아직 낯설고 서툰 일투성이다. 그래도 함께 수족관을 거닐고, 처음으로 커플 사진을 남기며 둘만의 추억을 하나씩 만들어간다. 돌아오는 길에는 마침내 내리기 시작한 첫눈을 함께 맞으며, 두 사람은 처음이라는 말로 가득한 하루의 행복을 마음 깊이 새긴다.\n\n그리고 오늘처럼 소중한 날들이 앞으로도 하나씩 쌓이고 또 쌓여, 언젠가는 셀 수 없을 만큼 많아졌으면 좋겠다고 생각한다.'),
]

const legacyRefrain = legacyTimeline.slice(0, 2)
export const defaultTimeline: TimelineEvent[] = [
  { ...legacyRefrain[0], id: 'autumn-refrain', dateLabel: '9–10월', body: legacyRefrain.map(item => `## ${item.month}월\n\n${item.body}`).join('\n\n') },
  ...legacyTimeline.slice(2),
]

// Only standalone subtitle lines are recognized. All content remains React text.
export function timelineBodyBlocks(body: string) {
  return body.split(/\n\s*\n/).flatMap(paragraph => paragraph.split(/^(## [^\n]+)\r?$/m)
    .filter(text => text.trim()).map(text => ({ subtitle: text.startsWith('## '), text: text.startsWith('## ') ? text.slice(3).trim() : text.trim() })))
}

export function timelineReadError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
  const reason = code === 'permission-denied'
    ? 'Firebase가 타임라인 읽기를 거부했어요. 운영 환경에 timeline 공개 읽기용 firestore.rules가 적용됐는지 확인해 주세요.'
    : code === 'invalid-data' ? '저장된 사건 데이터의 형식이 올바르지 않아요. 관리자 확인이 필요합니다.'
    : code === 'unavailable' ? '네트워크 또는 Firebase에 연결할 수 없어요.'
    : 'Firebase 연결 설정이나 서비스 상태를 확인해 주세요.'
  return reason + ' 기본 타임라인을 표시합니다. 공용 편집은 연결이 복구되면 사용할 수 있어요.'
}
