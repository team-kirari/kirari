import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Server-side path only: never use a VITE_* variable for this setting.
export function privateRepoRoot(projectRoot, env = process.env) {
  if (env.KIRARI_PRIVATE_REPO_DIR) return resolve(projectRoot, env.KIRARI_PRIVATE_REPO_DIR)
  const sibling = resolve(projectRoot, '../kirari-private')
  return !env.CI && existsSync(sibling) ? sibling : resolve(projectRoot, '.local/kirari-private')
}
