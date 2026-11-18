import { readdir, lstat, readFile, mkdir, writeFile, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { preparePhoto } from './photos.mjs'
import { parsePhotoMetadata } from '../src/lib/gallery-catalog.ts'

const groups = { gallery: 'gallery', 'kenji-old': 'profiles/kenji/old', 'kenji-new': 'profiles/kenji/new', 'kiyo-old': 'profiles/kiyo/old', 'kiyo-new': 'profiles/kiyo/new' }
const types = { png: 'image/png', apng: 'image/apng', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
export async function processStaged(root) {
  const base = resolve(root), staging = join(base, 'staging')
  const info = await lstat(staging)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid staging directory')
  let accepted = 0, rejected = 0
  for (const group of await readdir(staging)) {
    if (group === '.gitkeep') continue
    if (!Object.hasOwn(groups, group)) throw new Error('Invalid staging group')
    const directory = join(staging, group), directoryInfo = await lstat(directory)
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error('Invalid staging group')
    for (const name of await readdir(directory)) {
      const path = join(directory, name), fileInfo = await lstat(path)
      if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) throw new Error('Invalid staged file')
      let photo, credit, metadata
      try {
        const match = /^[a-f0-9]{64}\.(png|apng|jpg|webp|gif|json)$/.exec(name)
        if (!match || !fileInfo.size) throw new Error('Invalid staged image')
        let input = await readFile(path), mime = types[match[1]]
        if (match[1] === 'json') {
          const record = JSON.parse(input.toString('utf8'))
          if (!record || !['credit,image,mime,version', 'credit,image,metadata,mime,version'].includes(Object.keys(record).sort().join(',')) || record.version !== 1
            || !Object.values(types).includes(record.mime) || typeof record.credit !== 'string' || !record.credit.trim() || record.credit.length > 120
            || [...record.credit].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || typeof record.image !== 'string' || (record.image.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(record.image))) throw new Error('Invalid photo metadata')
          input = Buffer.from(record.image, 'base64'); mime = record.mime; credit = record.credit.trim()
          if (Object.hasOwn(record, 'metadata')) {
            metadata = parsePhotoMetadata(record.metadata)
            if (!metadata || metadata.credit !== credit) throw new Error('Invalid photo metadata')
          }
        }
        photo = await preparePhoto(input, mime, groups[group])
      } catch { rejected++; await unlink(path); continue }
      let target = base
      for (const segment of photo.path.split('/').slice(0, -1)) {
        target = join(target, segment)
        await mkdir(target, { recursive: true })
        const targetInfo = await lstat(target)
        if (!targetInfo.isDirectory() || targetInfo.isSymbolicLink()) throw new Error('Unsafe destination')
      }
      // Exclusive write: duplicate content is already present and is never overwritten.
      try { await writeFile(join(base, photo.path), Buffer.from(photo.content, 'base64'), { flag: 'wx' }) }
      catch (error) { if (error.code !== 'EEXIST') throw error }
      if (credit) {
        const metadataPath = join(base, photo.path.replace(/\.(?:webp|png)$/, '.json'))
        try { await writeFile(metadataPath, JSON.stringify(metadata || { credit }), { flag: 'wx' }) }
        catch (error) { if (error.code !== 'EEXIST') throw error }
      }
      await unlink(path)
      accepted++
    }
  }
  return { accepted, rejected }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await processStaged(process.argv[2] || '.')
  console.log(`Photo validation: ${result.accepted} accepted, ${result.rejected} rejected. Rejected uploads were not published.`)
}
