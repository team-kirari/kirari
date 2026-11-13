import { readdir, lstat, readFile, mkdir, copyFile, unlink } from 'node:fs/promises'
import { resolve, join, relative, sep } from 'node:path'
import { inspectImage, MAX_IMAGE_BYTES } from '../src/lib/profile-images.ts'

export const photoFolders = ['img', 'gallery', 'profiles/kenji/old', 'profiles/kenji/new', 'profiles/kiyo/old', 'profiles/kiyo/new']
const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

async function realDirectory(path) {
  const info = await lstat(path)
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Unsafe image directory')
}

export async function listPhotos(root) {
  const base = resolve(root)
  await realDirectory(base)
  const files = []
  for (const folder of photoFolders) {
    let directory = base
    for (const segment of folder.split('/')) { directory = join(directory, segment); await realDirectory(directory) }
    for (const name of await readdir(directory)) {
      if (name === '.gitkeep') continue
      const path = join(directory, name)
      const info = await lstat(path)
      const mime = types[name.split('.').at(-1).toLowerCase()]
      if (!info.isFile() || info.isSymbolicLink() || !mime || !info.size || info.size > MAX_IMAGE_BYTES) throw new Error('Invalid photo file')
      inspectImage(new Uint8Array(await readFile(path)), mime)
      files.push({ path, folder, name })
    }
  }
  return files
}

export async function copyPhotos(source, destination, { mirror = false } = {}) {
  const from = resolve(source), to = resolve(destination)
  if (from === to || !relative(from, to).startsWith(`..${sep}`) || !relative(to, from).startsWith(`..${sep}`)) throw new Error('Photo roots must be separate')
  const files = await listPhotos(from) // Validate everything before changing destination.
  await mkdir(to, { recursive: true })
  await realDirectory(to)
  for (const folder of photoFolders) {
    let directory = to
    for (const segment of folder.split('/')) { directory = join(directory, segment); await mkdir(directory, { recursive: true }); await realDirectory(directory) }
    if (mirror) {
      const names = new Set(files.filter(file => file.folder === folder).map(file => file.name))
      for (const name of await readdir(directory)) {
        if (name === '.gitkeep' || names.has(name)) continue
        const path = join(directory, name), info = await lstat(path)
        if (!info.isFile() || info.isSymbolicLink() || !types[name.split('.').at(-1).toLowerCase()]) throw new Error('Unexpected destination file')
        await unlink(path)
      }
    }
    for (const file of files.filter(file => file.folder === folder)) {
      const target = join(directory, file.name)
      try { if ((await lstat(target)).isSymbolicLink()) throw new Error('Unsafe destination') } catch (error) { if (error.code !== 'ENOENT') throw error }
      await copyFile(file.path, target, mirror ? 0 : 1) // Export never overwrites existing files.
    }
  }
  return files.length
}
