import { useEffect, useState } from 'react'
import { storyFonts } from './stories'
import type { StoryFont } from './stories'

export function useStoryFont(font: StoryFont) {
  const [loaded, setLoaded] = useState<{ font: StoryFont, ok: boolean } | null>(null)
  const selection = storyFonts[font]
  useEffect(() => {
    const selected = storyFonts[font]
    if (!('face' in selected)) return
    let active = true
    void document.fonts.load(`18px "${selected.face}"`, '이야기').then(faces => {
      if (active) setLoaded({ font, ok: faces.length > 0 })
    }).catch(() => { if (active) setLoaded({ font, ok: false }) })
    return () => { active = false }
  }, [font])
  if (!('face' in selection)) return ''
  if (loaded?.font !== font) return '폰트를 불러오는 중…'
  if (loaded.ok) return ''
  return '폰트를 불러오지 못해 사이트 기본 폰트로 표시해요.'
}
