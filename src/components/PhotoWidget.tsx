import type { MouseEvent } from 'react'

export function PhotoWidget({ index, items, openGallery }: { index: number, items: { src: string, title: string }[], openGallery: (event: MouseEvent<HTMLElement>) => void }) {
  const image = items.length ? items[index % items.length] : null
  return <div className="polaroid random-photo" data-widget-id="photo">
    <button className="polaroid-link" aria-label="갤러리 열기" onClick={openGallery}>
      {image ? <img src={image.src} alt={image.title} /> : <span className="photo-placeholder">✦<small>새로운 그림을 기다리며</small></span>}
    </button>
  </div>
}
