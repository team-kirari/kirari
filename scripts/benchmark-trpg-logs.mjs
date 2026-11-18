import { performance } from 'node:perf_hooks'
import { parseTrpgReplay } from '../src/lib/trpg-logs.ts'
import { decodeLogBase64 } from '../worker/log-index.mjs'

// Synthetic data only. Does not open a browser, read private logs or call APIs.
const json = JSON.stringify({ format: 'rollscene-studio-project-v1', assets: { synthetic: { src: 'x'.repeat(12_000_000) } }, messages: [{ speaker: '합성 화자', body: '합성 대사' }], events: [] })
const encoded = Buffer.from(json).toString('base64')
const source = `const B64='${encoded}';`
const measure = (label, operation) => {
  const cpu = process.cpuUsage(), start = performance.now()
  const result = operation()
  const elapsed = performance.now() - start, used = process.cpuUsage(cpu)
  console.log(JSON.stringify({ label, elapsedMs: Math.round(elapsed), cpuMs: Math.round((used.user + used.system) / 1000), resultBytes: result.byteLength }))
}
console.log(`Synthetic HTML: ${(Buffer.byteLength(source) / 1024 / 1024).toFixed(2)} MiB. Node measurements; not Cloudflare CPU limits.`)
measure('previous JS decoder only', () => Uint8Array.from(atob(encoded.replace(/\s/g, '')), character => character.charCodeAt(0)))
measure('native decoder only', () => decodeLogBase64(encoded))
measure('new complete server validation', () => {
  const replay = parseTrpgReplay(source, decodeLogBase64)
  if (replay.messages[0].body !== '합성 대사') throw new Error('benchmark validation')
  return { byteLength: Buffer.byteLength(source) }
})
