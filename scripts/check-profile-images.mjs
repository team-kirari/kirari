import { loadEnv } from 'vite'
import { resolve } from 'node:path'
import { listPhotos } from './photo-assets.mjs'
import { privateRepoRoot } from './private-repo.mjs'

let files
try { files = await listPhotos(resolve(privateRepoRoot(process.cwd(), { ...loadEnv('development', process.cwd(), ''), ...process.env }), 'assets')) }
catch (cause) { throw new Error('Photo sources are missing or invalid. Check the sibling kirari-private checkout or KIRARI_PRIVATE_REPO_DIR (see docs/local-stories.md).', { cause }) }
console.log(`Validated ${files.filter(file => !file.metadata).length} published photo headers and ${files.filter(file => file.metadata).length} copyright records (no photo count limit).`)
