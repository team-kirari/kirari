import { Buffer } from 'node:buffer'
import { isStoryDate, parseStoryDraft } from '../src/lib/stories.ts'

export const STORY_REPO = 'https://api.github.com/repos/team-kirari/kirari-private'
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/
const SHA = /^[a-f0-9]{40}$/
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const validOwner = value => typeof value === 'string' && value.length <= 128
const uniqueItems = (items, maxItems = 100) => Array.isArray(items) && items.length <= maxItems && new Set(items.map(item => item?.id)).size === items.length
export function validArchive(items, maxItems = 100) {
  return uniqueItems(items, maxItems) && items.every(item => item && parseStoryDraft(item)
    && UUID.test(item.id) && validOwner(item.owner)
    && UUID.test(item.mutation) && Number.isSafeInteger(item.revision) && item.revision > 0
    && validTime(item.createdAt) && validTime(item.updatedAt)
    && (item.passwordHash === null || typeof item.passwordHash === 'string' && /^[a-f0-9]{32}:[a-f0-9]{64}$/.test(item.passwordHash)))
}
export function buildStoryIndex(items) {
  return items.map(story => ({ id: story.id, title: story.title, author: story.passwordHash ? '' : story.author,
    createdAt: story.createdAt, ...(story.writtenOn ? { writtenOn: story.writtenOn } : {}),
    updatedAt: story.updatedAt, protected: story.passwordHash !== null, owner: story.owner }))
}
export function validIndex(items, maxItems = 100) {
  const fields = new Set(['id', 'title', 'author', 'createdAt', 'writtenOn', 'updatedAt', 'protected', 'owner'])
  return uniqueItems(items, maxItems) && items.every(item => item && Object.keys(item).every(key => fields.has(key))
    && typeof item.id === 'string' && UUID.test(item.id)
    && typeof item.title === 'string' && !!item.title.trim() && item.title.length <= 120
    && typeof item.author === 'string' && item.author.length <= 60
    && validTime(item.createdAt) && validTime(item.updatedAt)
    && (item.writtenOn === undefined || isStoryDate(item.writtenOn))
    && typeof item.protected === 'boolean' && (!item.protected || item.author === '') && validOwner(item.owner))
}
export class StoryStoreConflict extends Error {}

// api returns a Response. Keep credentials and private file contents out of errors.
export function createStoryStore(api, { directory = 'web-stories', validateArchive = validArchive, archiveBytes = 900_000, indexBytes = 900_000, maxItems = 100, rawArchive = false, buildIndex = buildStoryIndex, validateIndex = validIndex } = {}) {
  async function readFile(name, ref, maxBytes, validate) {
    const raw = rawArchive
    const response = await api(`/contents/${directory}/${name}.json?ref=${encodeURIComponent(ref)}`, undefined, 'GET', raw)
    if (response.status === 404) return null
    if (!response.ok) throw new Error('storage')
    if (raw) {
      const chunks = []
      let length = 0
      for await (const chunk of response.body) {
        length += chunk.byteLength
        if (length > maxBytes) throw new Error('format')
        chunks.push(Buffer.from(chunk))
      }
      const items = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!validate(items)) throw new Error('format')
      return items
    }
    const file = await response.json()
    if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.sha !== 'string'
      || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > maxBytes
      || typeof file.content !== 'string' || file.content.length > Math.ceil(maxBytes / 3) * 4 * 1.1) throw new Error('format')
    const bytes = Buffer.from(file.content, 'base64')
    if (bytes.byteLength > maxBytes) throw new Error('format')
    const items = JSON.parse(bytes.toString('utf8'))
    if (!validate(items)) throw new Error('format')
    return items
  }
  const readArchive = async (ref = 'main') => await readFile('archive', ref, archiveBytes, validateArchive) ?? []
  async function json(path, body, method) {
    const response = await api(path, body, method)
    if (response.status === 409 || response.status === 422) throw new StoryStoreConflict()
    if (!response.ok) throw new Error('storage')
    return response.json()
  }
  async function snapshot() {
    const ref = await json('/git/ref/heads/main')
    const head = ref.object?.sha
    if (ref.object?.type !== 'commit' || typeof head !== 'string' || !SHA.test(head)) throw new Error('format')
    const [commit, items] = await Promise.all([json(`/git/commits/${head}`), readArchive(head)])
    if (typeof commit.tree?.sha !== 'string' || !SHA.test(commit.tree.sha)) throw new Error('format')
    return { head, tree: commit.tree.sha, items }
  }
  async function commitFiles(snapshot, files, message) {
    const tree = await json('/git/trees', { base_tree: snapshot.tree,
      tree: files.map(([path, content]) => ({ path: `${directory}/${path}.json`, mode: '100644', type: 'blob', content: JSON.stringify(content) })) }, 'POST')
    if (typeof tree.sha !== 'string' || !SHA.test(tree.sha)) throw new Error('format')
    const commit = await json('/git/commits', { message, tree: tree.sha, parents: [snapshot.head] }, 'POST')
    if (typeof commit.sha !== 'string' || !SHA.test(commit.sha)) throw new Error('format')
    // A competing commit makes this non-fast-forward; never overwrite it.
    await json('/git/refs/heads/main', { sha: commit.sha, force: false }, 'PATCH')
  }
  return {
    readArchive,
    readIndex: () => readFile('index', 'main', indexBytes, items => validateIndex(items, maxItems)),
    snapshot,
    save: (snapshot, items) => commitFiles(snapshot, [['archive', items], ['index', buildIndex(items)]], rawArchive ? 'Save TRPG log and index' : 'Save web story and index'),
    async rebuildIndex() {
      const current = await snapshot()
      await commitFiles(current, [['index', buildIndex(current.items)]], 'Build web story index')
    },
  }
}
