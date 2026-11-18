import { defineConfig, loadEnv } from 'vite'
import { resolve, relative, isAbsolute } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { privateRepoRoot } from './scripts/private-repo.mjs'
import { createLocalStoryMiddleware } from './scripts/local-stories.ts'

export default defineConfig(({ mode }) => {
  const project = process.cwd()
  const repo = privateRepoRoot(project, { ...loadEnv(mode, project, ''), ...process.env })
  const assets = resolve(repo, 'assets')
  return {
    plugins: [react(), tailwindcss(), {
      name: 'kirari-local-stories',
      apply: 'serve',
      configureServer(server) {
        // The checkout itself is never a static content directory.
        server.middlewares.use((request, response, next) => {
          try {
            const path = decodeURIComponent((request.url ?? '').split('?')[0]).replace(/^\/kirari\//, '/')
            const candidate = path.startsWith('/@fs/') ? resolve(path.slice(5)) : resolve(project, `.${path}`)
            const inside = relative(repo, candidate)
            if (!isAbsolute(inside) && !inside.startsWith('..') && !/^assets[\\/](?:img|gallery|profiles[\\/](?:kenji|kiyo)[\\/](?:old|new))[\\/][^\\/]+\.(?:png|jpe?g|webp|gif)$/i.test(inside) && !/^assets[\\/]gallery[\\/][a-f0-9]{64}\.json$/.test(inside)) {
              response.writeHead(403); response.end(); return
            }
          } catch { response.writeHead(400); response.end(); return }
          next()
        })
        server.middlewares.use(createLocalStoryMiddleware(repo))
        server.middlewares.use(createLocalStoryMiddleware(repo, { logs: true }))
      },
    }],
    resolve: { alias: { '@private-assets': assets } },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      cors: false,
      fs: {
        strict: true,
        allow: [project, ...['img', 'gallery', 'profiles/kenji/old', 'profiles/kenji/new', 'profiles/kiyo/old', 'profiles/kiyo/new'].map(folder => resolve(assets, folder))],
        deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/stories/**', '**/trpg-logs/**', '**/web-trpg-logs/**', '**/web-secret-albums/**', '**/staging/**'],
      },
    },
    base: '/kirari/',
    build: { sourcemap: false },
  }
})
