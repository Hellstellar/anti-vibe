// Build the publishable `anti-vibe-mcp` package:
//   1. bundle the server's local TS into one ESM file (node_modules deps stay
//      external — they're declared in mcp/package.json), and
//   2. copy the built Anti-Vibe SPA (dist/) into the package as app/, so the bridge
//      can serve it.
// Run from the repo root AFTER `npm run build` (needs dist/). `npm run build:mcp`
// chains both.
import { build } from 'esbuild'
import { access, chmod, cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const mcpDir = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(mcpDir, '..')

const distDir = path.join(repoRoot, 'dist')
const outFile = path.join(mcpDir, 'bin', 'anti-vibe-mcp.mjs')
const appDir = path.join(mcpDir, 'app')

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

if (!(await exists(path.join(distDir, 'index.html')))) {
  console.error('dist/ not found — run `npm run build` first (build:mcp does this for you).')
  process.exit(1)
}

await build({
  entryPoints: [path.join(mcpDir, 'server.ts')],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  packages: 'external', // bundle only local code; keep declared deps external
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
})
await chmod(outFile, 0o755)

await rm(appDir, { recursive: true, force: true })
await mkdir(appDir, { recursive: true })
await cp(distDir, appDir, { recursive: true })

console.log('Built anti-vibe-mcp: bin/anti-vibe-mcp.mjs + app/ (from dist/)')
