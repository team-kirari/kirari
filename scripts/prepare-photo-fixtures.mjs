import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { photoFolders } from './photo-assets.mjs'

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==', 'base64')
const names = ['banana님 커미션_완성.png', '켄지키요.png', '켄지.png', '키요.png', '키요SD.png', '켄지SD.png']

export async function preparePhotoFixtures(checkout) {
  // An existing checkout is never modified, including a real private repository.
  await mkdir(dirname(checkout), { recursive: true })
  await mkdir(checkout)
  for (const folder of photoFolders) await mkdir(join(checkout, 'assets', folder), { recursive: true })
  for (const name of names) await writeFile(join(checkout, 'assets/img', name), pixel, { flag: 'wx' })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await preparePhotoFixtures(resolve('.local/kirari-private'))
  console.log('Prepared six synthetic 1px fixtures for checks; no private photos or credentials were used.')
}
