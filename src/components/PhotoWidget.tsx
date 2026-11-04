import type { MouseEvent } from 'react'
import { gallery } from '../content'

export function PhotoWidget({ index, openGallery }: { index: number, openGallery: (event: MouseEvent<HTMLElement>) => void }) {
  return <div className="polaroid random-photo" data-widget-id="photo">
    <button className="polaroid-link" aria-label="갤러리 열기" onClick={openGallery}>
      <img src={gallery[index].src} alt={gallery[index].title} />
    </button>
  </div>
}
