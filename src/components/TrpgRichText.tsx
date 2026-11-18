import { createElement } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { logMediaUrl, logImageDimensionsAllowed } from '../lib/trpg-media'
import type { RichNode } from '../lib/trpg-replay'

export function LogImage({ src, alt, className }: { src: string, alt: string, className?: string }) {
  return <img src={src} alt={alt} className={className} referrerPolicy="no-referrer" loading="lazy" onLoad={event => { if (!logImageDimensionsAllowed(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)) { event.currentTarget.hidden = true; event.currentTarget.nextElementSibling?.removeAttribute('hidden') } }} onError={event => { event.currentTarget.hidden = true; event.currentTarget.nextElementSibling?.removeAttribute('hidden') }} />
}

export default function TrpgRichText({ content, text, assets, media, limit = Infinity }: { content?: RichNode[], text: string, assets: Record<string, unknown>, media: boolean, limit?: number }) {
  let remaining = limit
  const take = (value: string) => { const chars = Array.from(value); const result = chars.slice(0, Math.max(0, remaining)).join(''); remaining -= chars.length; return result }
  const visit = (nodes: RichNode[], depth = 0): ReactNode => depth > 30 ? null : nodes.map((node, index) => {
    if (typeof node === 'string') return take(node)
    if (!node || typeof node !== 'object') return null
    const tag = String(node.tag ?? 'span').toLowerCase()
    if (['script', 'style', 'iframe', 'object', 'embed'].includes(tag)) return null
    if (tag === 'img') {
      const src = logMediaUrl(node.src, assets)
      return media && src ? <span className="trpg-inline-image" key={index}><LogImage src={src} alt={typeof node.alt === 'string' ? node.alt : '로그 이미지'} /><small hidden role="status">이미지를 불러오지 못했어요.</small></span> : null
    }
    const allowed = /^(span|div|p|br|strong|b|em|i|u|s|table|thead|tbody|tfoot|tr|td|th|caption|ul|ol|li|blockquote|hr)$/
    const safeTag = allowed.test(tag) ? tag : 'span'
    const style: CSSProperties = {}
    const properties = { color: 'color', 'background-color': 'backgroundColor', 'font-weight': 'fontWeight', 'font-style': 'fontStyle', 'text-decoration': 'textDecoration', 'text-align': 'textAlign', 'white-space': 'whiteSpace' } as const
    for (const [key, property] of Object.entries(properties)) {
      const value = node.style?.[key]
      if (typeof value === 'string' && value.length < 100 && /^[#\w\s(),.%-]+$/.test(value) && !/url|expression|var/i.test(value)) Object.assign(style, { [property]: value })
    }
    // Speaker/body colors use the theme for readability; dice emphasis retains semantic classes.
    delete style.color; delete style.backgroundColor
    const className = typeof node.className === 'string' ? node.className.split(/\s+/).filter(name => /^chat-(roll|roll-critical|roll-failure|roll-success|roll-template|missing-image)$/.test(name)).join(' ') : ''
    const saved = remaining
    const dice = safeTag === 'table' || /chat-roll/.test(className)
    if (dice) remaining = Infinity
    const children = ['br', 'hr'].includes(safeTag) ? [] : [typeof node.text === 'string' ? take(node.text) : '', Array.isArray(node.children) ? visit(node.children, depth + 1) : null]
    if (dice) remaining = saved
    return createElement(safeTag, { key: index, className, style, title: typeof node.title === 'string' ? node.title : undefined }, ...children)
  })
  return <div className="trpg-rich-text">{content ? visit(content) : take(text)}</div>
}
