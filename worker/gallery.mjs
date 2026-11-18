import { parseGalleryManifest } from '../src/lib/gallery-manifest.ts'

const repository = 'https://api.github.com/repos/team-kirari/kirari-private'
export async function handleGallery(request, env, fetcher = fetch) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin', 'Cross-Origin-Resource-Policy': 'cross-origin' }
  const reply = (status, error) => Response.json({ error }, { status, headers })
  const origin = request.headers.get('Origin')
  const local = /^http:\/\/(?:127\.0\.0\.1|localhost):5173$/.test(env.STORY_LOCAL_ORIGIN || '') ? env.STORY_LOCAL_ORIGIN : null
  if (origin && origin !== 'https://team-kirari.github.io' && origin !== local) return reply(403, '허용되지 않은 요청이에요.')
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, HEAD' } })
  if (!['GET', 'HEAD'].includes(request.method)) return reply(405, 'GET만 지원해요.')
  const url = new URL(request.url)
  const match = /^\/gallery(?:\/([a-f0-9]{64})\.(webp|png))?$/.exec(url.pathname)
  if (!match || url.search) return reply(404, '사진을 찾지 못했어요.')
  if (!env.STORY_GITHUB_WRITE_TOKEN) return reply(503, '갤러리 서버 설정을 확인해 주세요.')
  const upstreamHeaders = { Authorization: `Bearer ${env.STORY_GITHUB_WRITE_TOKEN}`, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'kirari-gallery' }
  try {
    // A fresh allowlist is required for every image request. Never proxy an
    // arbitrary path, SHA, private original, staging record or redirect URL.
    // Workers supports manual/follow, but not the browser's "error" mode.
    // Reject non-2xx responses below without following credentialed redirects.
    const index = await fetcher(`${repository}/contents/public-gallery.json?ref=main`, { headers: upstreamHeaders, redirect: 'manual', signal: AbortSignal.timeout(15000) })
    if (!index.ok) throw new Error('index')
    const photos = parseGalleryManifest(await index.json())
    if (!photos) throw new Error('index')
    if (!match[1]) return new Response(request.method === 'HEAD' ? null : JSON.stringify({ version: 1, photos: photos.map(({ id, extension, title, tags, album, credit }) => ({ id, extension, title, tags, album, credit })) }), { headers: { ...headers, 'Content-Type': 'application/json' } })
    const photo = photos.find(photo => photo.id === match[1] && photo.extension === match[2])
    if (!photo) return reply(404, '사진을 찾지 못했어요.')
    if (request.method === 'HEAD') return new Response(null, { headers: { ...headers, 'Content-Type': `image/${photo.extension}` } })
    const image = await fetcher(`${repository}/git/blobs/${photo.blob}`, { headers: upstreamHeaders, redirect: 'manual', signal: AbortSignal.timeout(20000) })
    if (!image.ok || !image.body) throw new Error('image')
    return new Response(image.body, { headers: { ...headers, 'Content-Type': `image/${photo.extension}`, 'Content-Disposition': `inline; filename="${photo.id}.${photo.extension}"` } })
  } catch { return reply(502, '갤러리를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.') }
}
