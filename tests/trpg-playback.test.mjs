import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { groupLogEntries, parseTrpgLog, splitLogContent } from '../src/lib/trpg-logs.ts'
import { logMediaUrl, logImageDimensionsAllowed } from '../src/lib/trpg-media.ts'
import { compactFieldMotions, youtubeVideoId } from '../src/lib/trpg-replay.ts'

const image = 'https://files.d20.io/synthetic.png'
const embedded = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
const fixture = overrides => ({ format: 'rollscene-studio-project-v1', messages: [{ id: 'one', speaker: 'Synthetic', body: 'First' }, { id: 'two', speaker: 'Synthetic', body: 'Second' }], events: [], assets: {}, ...overrides })
const parse = data => parseTrpgLog(`const B64='${Buffer.from(JSON.stringify(data)).toString('base64')}';`)
const event = (layer, sequence, extra = {}) => ({ layer, sequence, position: 0, ...extra })
const field = { id: 'figure', kind: 'figure', imageUrl: image, x: 10, y: 20, width: 100, height: 200, rotation: 30, zIndex: 4 }
const bounds = { x: -600, y: -360, width: 1200, height: 720 }

test('transcript groups consecutive speakers with the same portrait without losing source lines', () => {
  const parsed = parse(fixture({ messages: [
    { speaker: 'A', portrait: image, body: 'First' },
    { speaker: 'A', portrait: image, body: 'Second' },
    { speaker: 'A', portrait: 'https://files.d20.io/other.png', body: 'New expression' },
    { speaker: 'B', portrait: image, body: 'Other speaker' },
    { speaker: 'B', portrait: image, tab: 'ooc', body: 'Hidden' },
    { speaker: 'B', portrait: image, body: 'After hidden line' },
    { speaker: 'B', portrait: image, narration: true, body: 'Narration' },
    { speaker: 'B', portrait: image, narration: true, body: 'More narration' },
    { speaker: 'B', portrait: image, tab: 'other', narration: true, body: 'Other channel' },
  ] }))
  const entries = parsed.entries.filter(line => line.visible)
  const groups = groupLogEntries(entries)
  assert.deepEqual(groups.map(group => group.map(line => line.id)), [[0, 1], [2], [3], [5], [6, 7], [8]])
  assert.deepEqual(groups.flat(), entries)
  assert.equal(groups[0][1].text, 'Second')
  assert.equal(parsed.playback.find(line => line.sourceId === 1).text, 'Second')
  assert.deepEqual(groupLogEntries([]), [])
})

test('portable embedded images survive import in portraits, scene assets and rich content', () => {
  const data = fixture({ assets: { photo: { src: embedded } }, messages: [{ portrait: 'asset:photo', content: [{ tag: 'img', src: 'asset:photo' }] }], events: [event('background', 1, { assetId: 'photo' })] })
  const parsed = parse(data)
  assert.equal(parsed.entries[0].portrait, embedded)
  assert.equal(parsed.entries[0].background, embedded)
  assert.equal(parsed.playback.at(-1).image.src, embedded)
  assert.equal(logMediaUrl('data:image/png;base64,PHNjcmlwdD4='), '')
  assert.equal(logMediaUrl('https://storage.ccfolia-cdn.net/synthetic.png'), 'https://storage.ccfolia-cdn.net/synthetic.png')
  assert.equal(logMediaUrl('https://images.unsplash.com/synthetic'), 'https://images.unsplash.com/synthetic')
  assert.equal(logMediaUrl('https://storage.ccfolia-cdn.net.evil.test/synthetic.png'), '')
  for (const value of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PHNjcmlwdD4=', 'javascript:alert(1)', 'https://files.d20.io.evil.test/x']) assert.equal(logMediaUrl(value), '')
})

test('repeated layers, trailing transitions and backward state retain both BGM channels', () => {
  const parsed = parse(fixture({ events: [
    event('background', 1, { imageUrl: image }),
    event('bgm', 2, { channel: 'bgm01', audioName: 'A', youtubeUrl: 'https://youtu.be/abcdefghijk' }),
    event('bgm', 3, { channel: 'bgm02', audioName: 'B' }),
    event('background', 4, { imageUrl: 'https://files.d20.io/second.png' }),
    event('bgm', 5, { position: 1, channel: 'bgm01', status: 'stop' }),
    event('foreground', 6, { position: 2, imageUrl: 'ccfolia:none' }),
  ] }))
  assert.equal(parsed.playback[0].background, image)
  assert.equal(parsed.playback[1].background, 'https://files.d20.io/second.png')
  assert.equal(parsed.playback.at(-1).sceneOnly, true)
  assert.ok(parsed.playback.filter(line => line.sceneOnly).every(line => line.text === ''))
  assert.equal(parsed.entries[1].scene.bgm01, undefined)
  assert.equal(parsed.entries[1].scene.bgm02.audioName, 'B')
  assert.equal(parsed.playback[0].scene.bgm01.audioName, 'A')
  assert.equal(new Set(parsed.playback.map(line => line.id)).size, parsed.playback.length)
})

test('clear events and zero-sized foregrounds do not resurrect images', () => {
  const parsed = parse(fixture({ events: [event('background', 0, { imageUrl: image }), event('background', 1, { position: 1, status: 'clear', imageUrl: image }), event('foreground', 2, { position: 1, imageUrl: image, imageSize: { width: 0, height: 0 } })] }))
  assert.equal(parsed.entries[0].background, image)
  assert.equal(parsed.entries[1].background, '')
  assert.equal(parsed.entries[1].foreground, '')
})

test('previous exports with null optional asset references remain readable', () => {
  const parsed = parse(fixture({ events: [
    event('background', 1, { imageUrl: image, assetId: null }),
    event('bgm', 2, { channel: 'bgm01', audioAssetId: null, audioName: null, youtubeUrl: 'https://youtu.be/abcdefghijk' }),
    event('background', 3, { position: 1, status: 'clear', assetId: null, imageUrl: null }),
  ] }))
  assert.equal(parsed.entries[0].background, image)
  assert.equal(parsed.entries[1].background, '')
  assert.equal(parsed.entries[0].scene.bgm01.youtubeUrl, 'https://youtu.be/abcdefghijk')
  assert.equal(parsed.entries[0].scene.bgm01.audioAssetId, undefined)
})

test('inline music and hidden channels preserve scene changes independently of filtering', () => {
  const parsed = parse(fixture({ messages: [{ id: 'one', sourceMessageId: 'source', tab: 'ooc' }, { id: 'two', tab: 'main' }], events: [event('bgm', 1, { channel: 'bgm01', inlineMessageId: 'source', audioName: 'A' })] }))
  assert.equal(parsed.playback.length, 2)
  assert.equal(parsed.playback[0].visible, false)
  assert.equal(parsed.playback[1].scene.bgm01.audioName, 'A')
})

test('field motions preserve first and last poses, layout and rotation; malformed fields fail', () => {
  const fields = [0, 1, 2].map(sequence => event('fieldObjects', sequence, { bounds, objects: [{ ...field, x: sequence }] }))
  assert.deepEqual(compactFieldMotions(fields).map(item => item.sequence), [0, 2])
  const parsed = parse(fixture({ events: fields }))
  assert.equal(parsed.playback[0].scene.fields.objects[0].x, 0)
  assert.equal(parsed.entries[0].scene.fields.objects[0].x, 2)
  for (const objects of [[{ ...field, width: '100' }], [null], null]) assert.throws(() => parse(fixture({ events: [event('fieldObjects', 1, { bounds, objects })] })))
  for (const extra of [{ volume: '100' }, { loop: 'yes' }, { youtubeUrl: {} }]) assert.throws(() => parse(fixture({ events: [event('bgm', 1, extra)] })))
})

test('photographs preserve their order among dialogue while dice tables remain intact', () => {
  const nodes = [{ tag: 'p', children: ['Before', { tag: 'img', src: image }, { tag: 'strong', text: 'After' }] }, { tag: 'table', children: [{ tag: 'img', src: image }, { tag: 'tr', children: [{ tag: 'td', text: '1D6 → 6' }] }] }]
  const parts = splitLogContent(nodes, {})
  assert.equal(parts.length, 3)
  assert.equal(parts[1].image.src, image)
  assert.equal(parts[2].content[1].tag, 'table')
  const parsed = parse(fixture({ messages: [{ content: nodes }] }))
  assert.equal(parsed.entries.length, 1)
  assert.equal(parsed.playback.length, 3)
  assert.deepEqual(parsed.playback.map(line => line.sourceId), [0, 0, 0])
  assert.equal(parsed.playback[0].text, 'Before')
  assert.match(parsed.playback[2].text, /After.*1D6 → 6/s)
})

test('image dimensions and YouTube destinations have explicit boundaries', () => {
  assert.equal(logImageDimensionsAllowed(1920, 1080), true)
  for (const [w, h] of [[0, 1], [1, 20000], [10000, 10000], [NaN, 1]]) assert.equal(logImageDimensionsAllowed(w, h), false)
  assert.equal(youtubeVideoId('https://youtu.be/abcdefghijk'), 'abcdefghijk')
  assert.equal(youtubeVideoId('https://youtube.com.evil.test/watch?v=abcdefghijk'), '')
})

// Compile this component in memory for server rendering; no browser is opened.
const component = await readFile(new URL('../src/components/TrpgRichText.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(component, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
  .replaceAll("'react'", JSON.stringify(import.meta.resolve('react')))
  .replaceAll("'../lib/trpg-media'", JSON.stringify(new URL('../src/lib/trpg-media.ts', import.meta.url).href))
const { default: RichText } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('React rendering preserves rich tables and images while escaping XSS and unsafe URLs', () => {
  const content = [
    '<img src=x onerror=alert(1)>', { tag: 'script', text: 'evil()' },
    { tag: 'img', src: 'javascript:alert(1)' }, { tag: 'img', src: image, onerror: 'evil()' },
    { tag: 'table', children: [{ tag: 'tr', children: [{ tag: 'td', text: '6' }] }] },
    { tag: 'span', className: 'chat-roll-critical arbitrary', text: 'Success', style: { color: 'url(javascript:evil())' } },
  ]
  const html = renderToStaticMarkup(createElement(RichText, { content, text: '', assets: {}, media: true, limit: Infinity }))
  assert.match(html, /&lt;img/)
  assert.match(html, /<table\b/)
  assert.match(html, /src="https:\/\/files.d20.io\/synthetic.png"/)
  assert.match(html, /class="chat-roll-critical"/)
  assert.doesNotMatch(html, /<script|javascript:|arbitrary|evil\(\)|onerror="/)
  const disabled = renderToStaticMarkup(createElement(RichText, { content, text: '', assets: {}, media: false }))
  assert.doesNotMatch(disabled, /<img /)
})
