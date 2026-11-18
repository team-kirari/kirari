import { readdir, lstat, readFile, writeFile, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePhotoMetadata } from '../src/lib/gallery-catalog.ts'
import { inspectImage } from '../src/lib/profile-images.ts'

// Include only content-addressed outputs of preparePhoto, with public sidecars.
// Staging, original images, profiles and other private repository data are absent.
export async function writeGalleryManifest(root) {
  const base = resolve(root), directory = join(base, 'assets', 'gallery')
  for (const path of [base, join(base, 'assets'), directory]) {
    const info = await lstat(path)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe gallery directory')
  }
  const photos = []
  for (const name of (await readdir(directory)).sort()) {
    const match = /^([a-f0-9]{64})\.(webp|png)$/.exec(name)
    if (!match) continue
    const path = join(directory, name), sidecar = join(directory, `${match[1]}.json`)
    for (const file of [path, sidecar]) {
      const info = await lstat(file)
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unsafe gallery file')
    }
    const bytes = await readFile(path)
    if (createHash('sha256').update(bytes).digest('hex') !== match[1]) throw new Error('Invalid gallery digest')
    inspectImage(bytes, `image/${match[2]}`)
    const metadata = parsePhotoMetadata(JSON.parse(await readFile(sidecar, 'utf8')))
    if (!metadata) throw new Error('Invalid gallery metadata')
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    photos.push({ id: match[1], extension: match[2], blob, ...metadata })
  }
  if (new Set(photos.map(photo => photo.id)).size !== photos.length || photos.length > 10000) throw new Error('Invalid gallery manifest')
  // Rename replaces a possible old symlink instead of following it.
  const temporary = join(base, `.gallery-${crypto.randomUUID()}.tmp`)
  await writeFile(temporary, JSON.stringify({ version: 1, photos }), { flag: 'wx' })
  await rename(temporary, join(base, 'public-gallery.json'))
  return photos.length
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Published gallery index: ${await writeGalleryManifest(process.argv[2] || '.')} validated photos.`)
}
