import { buildStoryIndex, StoryStoreConflict, validArchive } from './story-store.mjs'
import { buildLogIndex, validLogIndex } from './log-index.mjs'
import { LOG_METADATA_VERSION } from '../src/lib/trpg-log-summary.ts'

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/
const SHA = /^[a-f0-9]{40}$/
const directory = 'web-trpg-logs'
const validLogs = items => validArchive(items, Infinity) && items.every(item => item.passwordHash !== null)

// The index is authoritative, including for legacy entries. Never fall back to
// an old archive when an ID has been removed from an existing index.
export function createLogStore(api) {
  async function read(name, ref) {
    const response = await api(`/contents/${directory}/${name}.json?ref=${encodeURIComponent(ref)}`, undefined, 'GET', true)
    if (response.status === 404) return null
    if (!response.ok) throw new Error('storage')
    return response.json()
  }
  async function json(path, body, method) {
    const response = await api(path, body, method)
    if (response.status === 409 || response.status === 422) throw new StoryStoreConflict()
    if (!response.ok) throw new Error('storage')
    return response.json()
  }
  async function head() {
    const ref = await json('/git/ref/heads/main')
    if (ref.object?.type !== 'commit' || !SHA.test(ref.object.sha)) throw new Error('format')
    return ref.object.sha
  }
  async function archive(ref) {
    const items = await read('archive', ref) ?? []
    if (!validLogs(items)) throw new Error('format')
    return items
  }
  async function catalog(ref) {
    const index = await read('index', ref)
    if (index === null) return buildLogIndex(await archive(ref))
    if (!validLogIndex(index) || index.some(item => !item.protected)) throw new Error('format')
    if (index.every(item => item.logMetadataVersion === LOG_METADATA_VERSION)) return index
    // Upgrade only outdated legacy entries, without changing the repository.
    const legacy = await archive(ref)
    return index.map(item => {
      if (item.logMetadataVersion === LOG_METADATA_VERSION) return item
      if (item.storage === 'file') throw new Error('format')
      const original = legacy.find(log => log.id === item.id)
      if (!original) throw new Error('format')
      return buildLogIndex([original])[0]
    })
  }
  async function selected(index, id, ref) {
    if (!UUID.test(id)) throw new Error('format')
    const entry = index.find(item => item.id === id)
    if (!entry) return []
    const items = entry.storage === 'file' ? [await read(`entries/${id}`, ref)] : (await archive(ref)).filter(item => item.id === id)
    if (items.length !== 1 || !validLogs(items) || items[0].id !== id || items[0].owner !== entry.owner) throw new Error('format')
    return items
  }
  return {
    readIndex: () => catalog('main'),
    async readArchive(id) {
      const ref = await head()
      return selected(await catalog(ref), id, ref)
    },
    async snapshot(id) {
      const ref = await head()
      const [commit, index] = await Promise.all([json(`/git/commits/${ref}`), catalog(ref)])
      if (!SHA.test(commit.tree?.sha)) throw new Error('format')
      return { head: ref, tree: commit.tree.sha, index, targetId: id, items: await selected(index, id, ref) }
    },
    async save(snapshot, items, metadata) {
      const id = snapshot.targetId
      if (!UUID.test(id) || items.length > 1 || !validLogs(items) || items.some(item => item.id !== id)) throw new Error('format')
      const index = snapshot.index.filter(item => item.id !== id)
      const files = []
      if (items.length) {
        const item = items[0]
        index.push({ ...buildStoryIndex([item])[0], ...metadata, logMetadataVersion: LOG_METADATA_VERSION, storage: 'file' })
        if (!validLogIndex(index)) throw new Error('format')
        // Upload only this log as a blob. The Git tree request stays small and
        // never serializes every existing HTML file again.
        const blob = await json('/git/blobs', { content: JSON.stringify(item), encoding: 'utf-8' }, 'POST')
        if (!SHA.test(blob.sha)) throw new Error('format')
        files.push({ path: `${directory}/entries/${id}.json`, mode: '100644', type: 'blob', sha: blob.sha })
      } else if (snapshot.index.find(item => item.id === id)?.storage === 'file') {
        files.push({ path: `${directory}/entries/${id}.json`, mode: '100644', type: 'blob', sha: null })
      }
      files.push({ path: `${directory}/index.json`, mode: '100644', type: 'blob', content: JSON.stringify(index) })
      const tree = await json('/git/trees', { base_tree: snapshot.tree, tree: files }, 'POST')
      if (!SHA.test(tree.sha)) throw new Error('format')
      const commit = await json('/git/commits', { message: items.length ? 'Save TRPG log and index' : 'Delete TRPG log and index', tree: tree.sha, parents: [snapshot.head] }, 'POST')
      if (!SHA.test(commit.sha)) throw new Error('format')
      await json('/git/refs/heads/main', { sha: commit.sha, force: false }, 'PATCH')
    },
  }
}
