// Keep remote requests within reviewed providers; portable raster/audio assets stay local.
export function logMediaUrl(value: unknown, assets: Record<string, unknown> = {}): string {
  if (typeof value !== 'string') return ''
  if (value.startsWith('asset:')) {
    const asset = assets[value.slice(6)]
    value = asset && typeof asset === 'object' && 'src' in asset ? asset.src : ''
  }
  if (typeof value !== 'string') return ''
  if (/^data:(?:image\/(?:png|jpeg|jpg|webp|gif)|audio\/(?:mpeg|mp3|ogg|wav|webm|mp4|x-wav));base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)) {
    if (/^data:image\//i.test(value)) {
      try {
        const header = atob(value.slice(value.indexOf(',') + 1, value.indexOf(',') + 49))
        const mime = value.slice(5, value.indexOf(';')).toLowerCase()
        const valid = mime === 'image/png' ? header.startsWith('\x89PNG\r\n\x1a\n') : /image\/jpe?g/.test(mime) ? header.startsWith('\xff\xd8\xff') : mime === 'image/gif' ? /^GIF8[79]a/.test(header) : header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP'
        return valid ? value : ''
      } catch { return '' }
    }
    return value
  }
  if (value.length > 4096) return ''
  try {
    const url = new URL(value)
    const hosts = ['files.d20.io', 'assets.ccfolia.com', 'storage.ccfolia-cdn.net', 'images.unsplash.com', 'cdn.discordapp.com', 'media.discordapp.net']
    const s3 = /^(?:[a-z0-9-]+\.)?s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(url.hostname)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && (hosts.includes(url.hostname) || s3) ? url.href : ''
  } catch { return '' }
}
export const logImageDimensionsAllowed = (width: number, height: number) => width > 0 && height > 0 && width <= 16384 && height <= 16384 && width * height <= 40_000_000
