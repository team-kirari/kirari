import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, copyFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import { preparePhotoFixtures } from '../scripts/prepare-photo-fixtures.mjs'
import { createLocalStoryStore } from '../scripts/local-stories.ts'

test('Vite serves only approved assets, local story API works under Pages base, raw private files stay blocked', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'kirari-vite-stories-'))
  const checkout = join(temporary, 'kirari-private')
  await preparePhotoFixtures(checkout)
  await copyFile(join(checkout, 'assets/img/켄지.png'), join(checkout, 'assets/profiles/kenji/new/synthetic.png'))
  const marker = 'SYNTHETIC_PRIVATE_STORY_MUST_NOT_BE_STATIC'
  const story = await createLocalStoryStore(checkout).save({ title: '합성 비공개 글', author: '', body: marker, font: 'default', password: '합성한글비밀번호' })
  await writeFile(join(checkout, 'README.md'), marker)
  const previous = process.env.KIRARI_PRIVATE_REPO_DIR
  process.env.KIRARI_PRIVATE_REPO_DIR = checkout
  const server = await createServer({ server: { port: 0 }, logLevel: 'error' })
  t.after(async () => { await server.close(); if (previous === undefined) delete process.env.KIRARI_PRIVATE_REPO_DIR; else process.env.KIRARI_PRIVATE_REPO_DIR = previous })
  await server.listen()
  const base = `http://127.0.0.1:${server.httpServer.address().port}/kirari`
  const response = await fetch(`${base}/__local/stories`, { headers: { 'X-Kirari-Local': '1' } })
  assert.equal(response.status, 200)
  assert.equal((await response.text()).includes(marker), false)
  for (const file of [`stories/${story.id}.json`, 'README.md', '.git/config']) {
    const result = await fetch(`${base}/@fs/${checkout.replaceAll('\\', '/')}/${file}?raw`)
    assert.equal(result.status, 403)
    assert.equal((await result.text()).includes(marker), false)
  }
  const image = await fetch(`${base}/@fs/${checkout.replaceAll('\\', '/')}/assets/img/${encodeURIComponent('켄지.png')}`)
  assert.equal(image.status, 200)
  const profiles = await server.ssrLoadModule('/src/lib/profile-illustrations.ts')
  assert.equal(profiles.profileIllustrations.kenji.new.length, 1, 'alias glob paths must retain profile candidates')
  const component = await fetch(`${base}/src/components/StoryScreen.tsx`)
  assert.equal(component.status, 200)
  assert.equal((await component.text()).includes(marker), false)
})
