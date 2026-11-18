import { lstat, mkdir, open, readdir, readFile, rename, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { compareStories, parseStoryDraft } from '../src/lib/stories.ts'
import type { Story } from '../src/lib/stories.ts'
import { parseTrpgReplay } from '../src/lib/trpg-logs.ts'
import { Buffer } from 'node:buffer'
import { metadataFromLog } from '../src/lib/trpg-log-summary.ts'

const derive = promisify(scrypt)
const idPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/
const MAX_BYTES = 500_000
type RecordStory = Omit<Story, 'protected'> & { passwordHash: string | null }
class StoryError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
const unavailable = () => new StoryError(404, '글을 열 수 없어요.')

export function createLocalStoryStore(repo: string, { logs = false } = {}) {
  const root = resolve(repo), directory = join(root, logs ? 'trpg-logs' : 'stories')
  let queue: Promise<unknown> = Promise.resolve()
  async function checkDirectory(create = false) {
    const source = await lstat(root)
    if (!source.isDirectory() || source.isSymbolicLink()) throw new StoryError(503, '로컬 저장소 경로를 확인해 주세요.')
    if (create) await mkdir(directory, { recursive: false }).catch(error => { if (error.code !== 'EEXIST') throw error })
    try {
      const info = await lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink()) throw unavailable()
      return true
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !create) return false; throw error }
  }
  async function read(id: string): Promise<RecordStory> {
    if (!idPattern.test(id) || !await checkDirectory()) throw unavailable()
    const path = join(directory, `${id}.json`)
    let data: RecordStory
    try {
      const info = await lstat(path)
      if (!info.isFile() || info.isSymbolicLink() || !logs && info.size > MAX_BYTES) throw unavailable()
      data = JSON.parse(await readFile(path, 'utf8')) as RecordStory
    } catch { throw unavailable() }
    if (!parseStoryDraft(data) || data.id !== id || !Number.isSafeInteger(data.revision) || data.revision < 1
      || typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt))
      || typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt))
      || !(data.passwordHash === null || typeof data.passwordHash === 'string' && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(data.passwordHash))) throw unavailable()
    if (logs && data.passwordHash === null) throw unavailable()
    return data
  }
  function present(data: RecordStory): Story {
    // Explicit allowlist: never return password hashes or unexpected stored fields.
    return { ...parseStoryDraft(data)!, id: data.id, revision: data.revision, createdAt: data.createdAt, updatedAt: data.updatedAt, protected: data.passwordHash !== null }
  }
  return {
    remove(id: string, revision: unknown): Promise<void> {
      const job = queue.catch(() => {}).then(async () => {
        if (!logs) throw unavailable()
        const previous = await read(id)
        if (!Number.isSafeInteger(revision) || previous.revision !== revision) throw new StoryError(409, '다른 곳에서 수정된 로그예요. 목록에서 다시 확인해 주세요.')
        await unlink(join(directory, `${id}.json`))
      })
      queue = job
      return job
    },
    async list() {
      if (!await checkDirectory()) return []
      const names = (await readdir(directory)).filter(name => idPattern.test(name.replace(/\.json$/, '')) && name.endsWith('.json'))
      if (!logs && names.length > 1000) throw new StoryError(503, '로컬 이야기 목록의 한도를 초과했어요.')
      const items = []
      for (const name of names) {
        const data = await read(name.slice(0, -5))
        items.push({ id: data.id, title: data.title, author: data.passwordHash ? '' : data.author, createdAt: data.createdAt, updatedAt: data.updatedAt, ...(data.writtenOn ? { writtenOn: data.writtenOn } : {}), protected: data.passwordHash !== null, ...(logs ? metadataFromLog(data.body) : {}) })
      }
      return items.sort(compareStories)
    },
    async get(id: string, password?: string, owner = false) {
      const wrongPassword = () => logs && !owner ? new StoryError(404, '비밀번호가 다릅니다.') : unavailable()
      const data = await read(id).catch(error => { if (error instanceof StoryError && error.status === 404) throw wrongPassword(); throw error })
      if (data.passwordHash && !owner) {
        if (typeof password !== 'string' || !password) throw wrongPassword()
        const [salt, expected] = data.passwordHash.split(':')
        const actual = await derive(password, salt, 64) as Buffer
        if (!timingSafeEqual(actual, Buffer.from(expected, 'hex'))) throw wrongPassword()
      }
      return present(data)
    },
    save(input: unknown): Promise<Story> {
      const job = queue.catch(() => {}).then(async () => {
        const draft = parseStoryDraft(input)
        if (!draft) throw new StoryError(400, '제목·본문·폰트 입력을 확인해 주세요.')
        const request = input as Record<string, unknown>
        const id = request.id === undefined ? randomUUID() : request.id
        if (typeof id !== 'string' || !idPattern.test(id)) throw unavailable()
        const previous = request.id === undefined ? null : await read(id)
        if (logs) {
          if (!previous && (typeof request.password !== 'string' || !request.password.trim()) || request.password !== null && (typeof request.password !== 'string' || !request.password.trim())) throw new StoryError(400, '로그에는 비밀번호가 필요해요.')
          try { parseTrpgReplay(draft.body, encoded => Buffer.from(encoded, 'base64')) } catch { throw new StoryError(400, '시네마틱 로그 형식을 확인해 주세요.') }
        }
        if (previous && previous.revision !== request.revision) throw new StoryError(409, '다른 곳에서 수정된 글이에요. 작성 내용을 복사한 뒤 목록에서 다시 열어 주세요.')
        let passwordHash = previous?.passwordHash ?? null
        // null preserves the current password; empty string removes it.
        if (request.password !== null) {
          if (typeof request.password !== 'string') throw new StoryError(400, '비밀번호 입력을 확인해 주세요.')
          if (request.password) {
            const salt = randomBytes(16).toString('hex')
            passwordHash = `${salt}:${(await derive(request.password, salt, 64) as Buffer).toString('hex')}`
          } else passwordHash = null
        }
        const now = new Date().toISOString()
        const data: RecordStory = { ...draft, ...(draft.fontSize === undefined && previous?.fontSize !== undefined ? { fontSize: previous.fontSize } : {}), ...(draft.writtenOn === undefined && previous?.writtenOn ? { writtenOn: previous.writtenOn } : {}), id, revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? now, updatedAt: now, passwordHash }
        await checkDirectory(true)
        const temporary = join(directory, `.${randomUUID()}.tmp`)
        try {
          const handle = await open(temporary, 'wx', 0o600)
          try { await handle.writeFile(JSON.stringify(data, null, 2), 'utf8'); await handle.sync() } finally { await handle.close() }
          await rename(temporary, join(directory, `${id}.json`))
        } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
        return present(data)
      })
      queue = job
      return job
    },
  }
}

export function createLocalStoryMiddleware(repo: string, { logs = false } = {}) {
  const store = createLocalStoryStore(repo, { logs })
  const attempts = new Map<string, { count: number, until: number }>()
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = (request.url ?? '').split('?')[0]
    if (!path.startsWith(logs ? '/kirari/__local/trpg-logs' : '/kirari/__local/stories')) { next(); return }
    function reply(status: number, data: unknown) {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' })
      response.end(JSON.stringify(data))
    }
    try {
      const host = request.headers.host ?? ''
      const address = request.socket.remoteAddress ?? ''
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)
        || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
        || request.headers['x-kirari-local'] !== '1'
        || request.headers.origin && request.headers.origin !== `http://${host}`
        || request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin') throw new StoryError(403, '이 기능은 같은 기기의 로컬 화면에서만 사용할 수 있어요.')
      const match = (logs ? /^\/kirari\/__local\/trpg-logs(?:\/([a-f0-9-]+)(?:\/(unlock|edit|delete))?)?$/ : /^\/kirari\/__local\/stories(?:\/([a-f0-9-]+)(?:\/(unlock|edit))?)?$/).exec(path)
      if (!match) throw unavailable()
      const [, id, action] = match
      if (action === 'delete' && (request.method !== 'POST' || request.headers['x-kirari-local-author'] !== '1')) throw new StoryError(403, '로컬 작성자 권한이 필요해요.')
      if (request.method === 'GET' && !action) { reply(200, id ? await store.get(id) : logs ? (await store.list()).map(item => ({ id: item.id, title: item.title, logDate: item.logDate ?? null, preview: item.preview ?? null, editable: request.headers['x-kirari-local-author'] === '1' })) : await store.list()); return }
      // Local author access is intentionally separate from the reader password.
      if (request.method === 'GET' && id && action === 'edit') { reply(200, await store.get(id, undefined, true)); return }
      if (request.method !== 'POST' || request.headers['content-type'] !== 'application/json') throw new StoryError(405, '지원하지 않는 요청이에요.')
      const key = address
      if (attempts.size > 100) for (const [name, value] of attempts) if (value.until < Date.now()) attempts.delete(name)
      const limit = attempts.get(key)
      if (limit && limit.until > Date.now() && limit.count >= 30) throw new StoryError(429, '요청이 많아요. 1분 뒤 다시 시도해 주세요.')
      attempts.set(key, limit && limit.until > Date.now() ? { ...limit, count: limit.count + 1 } : { count: 1, until: Date.now() + 60_000 })
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of request) {
        size += Buffer.byteLength(chunk)
        if (action === 'delete' ? size > 1024 : !logs && size > MAX_BYTES) throw new StoryError(413, '글의 용량이 너무 커요.')
        chunks.push(Buffer.from(chunk))
      }
      let body: unknown
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new StoryError(400, '잘못된 요청이에요.') }
      if (id && action === 'delete') { await store.remove(id, (body as { revision?: unknown } | null)?.revision); reply(200, { deleted: true }); return }
      if (!id && !action) { reply(200, await store.save(body)); return }
      if (id && action === 'unlock') { reply(200, await store.get(id, (body as { password?: string } | null)?.password)); return }
      throw unavailable()
    } catch (error) {
      reply(error instanceof StoryError ? error.status : 503, { error: error instanceof StoryError ? error.message : '로컬 저장소를 읽거나 저장하지 못했어요. 경로와 파일 형식을 확인해 주세요.' })
    }
  }
}
