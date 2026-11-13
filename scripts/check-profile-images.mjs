import { fileURLToPath } from 'node:url'
import { listPhotos } from './photo-assets.mjs'

let files
try { files = await listPhotos(fileURLToPath(new URL('../.local/kirari-private/assets/', import.meta.url))) }
catch (cause) { throw new Error('Photo sources are missing or invalid. Clone kirari-private into .local/kirari-private (see docs/private-photos.md).', { cause }) }
console.log(`Validated ${files.length} published photo headers (no photo count limit).`)
