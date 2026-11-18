import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildStoryIndex, validArchive } from '../worker/story-store.mjs'

// Reuse Git authentication without extracting credentials. An isolated Git index
// preserves the checkout's branch, working files and staged changes.
let scratch
try {
  const repository = process.argv[2]
  if (!repository || process.argv[3] !== '--write') throw new Error('usage')
  const directory = resolve(repository)
  const git = (args, input, env = process.env) => {
    const result = spawnSync('git', ['-C', directory, ...args], {
      input, encoding: 'utf8', env, maxBuffer: 4_000_000, timeout: 60_000, windowsHide: true,
    })
    if (result.status !== 0 || result.error) throw new Error('git')
    return result.stdout.trim()
  }
  const remote = git(['remote', 'get-url', 'origin'])
  const httpsRemote = remote.startsWith('https:') ? new URL(remote) : null
  const expectedRemote = httpsRemote
    ? httpsRemote.hostname === 'github.com' && !httpsRemote.port && !httpsRemote.search && !httpsRemote.hash
      && /^\/team-kirari\/kirari-private(?:\.git)?$/.test(httpsRemote.pathname)
    : /^git@github\.com:team-kirari\/kirari-private(?:\.git)?$/.test(remote)
  if (!expectedRemote) throw new Error('repository')
  git(['fetch', 'origin', 'main'])
  const head = git(['rev-parse', 'FETCH_HEAD'])
  const items = JSON.parse(git(['show', `${head}:web-stories/archive.json`]))
  if (!validArchive(items)) throw new Error('format')
  const content = JSON.stringify(buildStoryIndex(items))
  scratch = mkdtempSync(join(tmpdir(), 'kirari-story-index-'))
  const env = { ...process.env, GIT_INDEX_FILE: join(scratch, 'index') }
  git(['read-tree', head], undefined, env)
  const blob = git(['hash-object', '-w', '--stdin'], content)
  git(['update-index', '--add', '--cacheinfo', `100644,${blob},web-stories/index.json`], undefined, env)
  const tree = git(['write-tree'], undefined, env)
  if (tree === git(['rev-parse', `${head}^{tree}`])) {
    console.log('Story index is already current.')
  } else {
    const commit = git(['commit-tree', tree, '-p', head], 'Build web story index\n')
    // No force: a competing commit is rejected instead of overwritten.
    git(['push', 'origin', `${commit}:refs/heads/main`])
    console.log('Story index committed to kirari-private/main; archive and checkout files unchanged.')
  }
} catch {
  console.error('Index build failed. Usage: node --experimental-strip-types scripts/rebuild-story-index.mjs <private-checkout> --write. Check repository, Git authentication and concurrent commits; no private contents are printed.')
  process.exitCode = 1
} finally {
  // Only the fresh temporary Git index directory is removed.
  if (scratch) {
    rmSync(join(scratch, 'index'), { force: true })
    rmSync(join(scratch, 'index.lock'), { force: true })
    rmdirSync(scratch)
  }
}
