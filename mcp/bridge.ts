import http from 'node:http'
import { promises as fs, createReadStream, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { getDoc, getDocs, onDocument, addDoc, type AntiVibeDoc } from './doc-store'

export const HOST = '127.0.0.1'
export const PORT = Number(process.env.ANTIVIBE_MCP_PORT) || 7777
export const BRIDGE_URL = `http://${HOST}:${PORT}/`

const HEALTH_MARKER = 'antivibe-bridge'
const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Package version, read from the sibling package.json in both layouts (source:
 * `mcp/package.json`; packaged bin: `mcp/bin` -> `../package.json`). Drives the
 * version handshake: a newer server reclaims the shared port from an older
 * bridge instead of forwarding to stale code. Falls back to '0.0.0' if unread
 * (also what a pre-handshake bridge reports, so newer code always wins).
 */
export const VERSION: string = (() => {
  for (const rel of ['./package.json', '../package.json']) {
    try {
      const v = JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')).version
      if (typeof v === 'string') return v
    } catch {
      /* try next layout */
    }
  }
  return '0.0.0'
})()

/** True when semver `a` is strictly older than `b` (numeric x.y.z compare). */
export function isOlder(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x < y
  }
  return false
}

/**
 * Locate the built Anti-Vibe SPA. Works in two layouts: the published npm package
 * (bundled `bin/anti-vibe-mcp.mjs` next to a copied `app/`) and the source repo
 * (`mcp/server.ts` run via tsx, with the build in `../dist`). `ANTIVIBE_DIST_DIR`
 * overrides everything.
 */
function resolveDistDir(): string {
  const candidates = [
    process.env.ANTIVIBE_DIST_DIR,
    // Source repo (mcp/ -> ../dist): prefer a fresh `npm run build` output over
    // a stale `app/` left behind by an earlier `build:mcp`, so `npm run mcp`
    // never silently serves an outdated UI. A published package has no sibling
    // dist/, so it falls through to the packaged app/ below.
    path.resolve(here, '..', 'dist'),
    path.resolve(here, '..', 'app'), // packaged: bin/ -> ../app
    path.resolve(here, 'app'), // packaged (flat)
  ].filter((c): c is string => Boolean(c))
  for (const c of candidates) {
    if (existsSync(path.join(c, 'index.html'))) return c
  }
  return candidates[candidates.length - 1]
}

const DIST_DIR = resolveDistDir()

/** STDOUT is the MCP protocol channel — all diagnostics MUST go to stderr. */
export function log(...args: unknown[]): void {
  console.error('[anti-vibe-mcp]', ...args)
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

const PLACEHOLDER = `<!doctype html><meta charset=utf-8><title>Anti-Vibe bridge</title>
<body style="font:16px ui-monospace,monospace;background:#0a0705;color:#e8d9c0;padding:3rem">
<h1>Anti-Vibe not built</h1>
<p>The MCP bridge is running, but <code>dist/</code> was not found.</p>
<p>Run <code>npm run build</code> in the Anti-Vibe repo, then reload.</p>
</body>`

/** Active SSE responses; size drives open-on-first-push. */
const sseClients = new Set<http.ServerResponse>()
/** True after we've opened a browser and are waiting for it to connect. */
let pendingOpen = false
/** The bound HTTP server (module-scoped so the shutdown route can close it). */
let server: http.Server | null = null
/** Invoked after this process relinquishes the shared port to a newer bridge,
 *  so the owner can switch to forwarding mode instead of terminating. */
let onRelinquishCb: (() => void) | null = null

/** Register a callback fired when this bridge relinquishes the port (a newer
 *  server took over). The owner uses it to flip to forwarding, keeping its own
 *  MCP session alive. */
export function onBridgeRelinquished(cb: () => void): void {
  onRelinquishCb = cb
}

/** Close SSE clients + the HTTP server, freeing the port. */
function closeAll(): void {
  for (const c of sseClients) c.end()
  server?.close()
  server = null
}

function send(res: http.ServerResponse, doc: AntiVibeDoc): void {
  res.write(`event: document\ndata: ${JSON.stringify(doc)}\n\n`)
}

async function distExists(): Promise<boolean> {
  try {
    await fs.access(path.join(DIST_DIR, 'index.html'))
    return true
  } catch {
    return false
  }
}

/** Open the system browser at the bridge URL (best-effort, cross-platform). */
function openBrowser(url: string): void {
  const platform = process.platform
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url]
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
    log('opened browser at', url)
  } catch (err) {
    log('could not open browser:', err)
  }
}

function notFound(res: http.ServerResponse): void {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('Not found')
}

/** Resolve a request path to a file inside DIST_DIR, guarding against traversal. */
function resolveStatic(urlPath: string): string | null {
  const clean = decodeURIComponent(urlPath.split('?')[0])
  const rel = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '')
  const abs = path.resolve(DIST_DIR, rel)
  if (abs !== DIST_DIR && !abs.startsWith(DIST_DIR + path.sep)) return null
  return abs
}

async function serveFile(res: http.ServerResponse, file: string): Promise<boolean> {
  try {
    const stat = await fs.stat(file)
    if (!stat.isFile()) return false
    const type = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
    res.writeHead(200, { 'content-type': type })
    createReadStream(file).pipe(res)
    return true
  } catch {
    return false
  }
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf-8')
}

function handleSse(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  })
  res.write(': connected\n\n')
  sseClients.add(res)
  pendingOpen = false // a tab is here; allow re-open on a future doc when none remain
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000)
  // Late-connecting tab: replay the whole library (oldest first) so it hydrates
  // every doc, not just the newest — the receiver dedupes by documentId.
  for (const doc of getDocs()) send(res, doc)
  req.on('close', () => {
    clearInterval(heartbeat)
    sseClients.delete(res)
  })
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const url = req.url ?? '/'
  const method = req.method ?? 'GET'

  // --- bridge API (under /__antivibe) ---
  if (url === '/__antivibe/events') return handleSse(req, res)

  if (url === '/__antivibe/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ app: HEALTH_MARKER, version: VERSION, clients: sseClients.size }))
    return
  }

  // A newer server asks this (older) bridge to release the shared port. Ack,
  // then close the HTTP server so the newer one can bind — but keep THIS process
  // alive: it's a full MCP server for its own client. onRelinquishCb flips it to
  // forwarding, so its future pushes go to the new owner. See ensureBridge.
  if (url === '/__antivibe/shutdown' && method === 'POST') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, version: VERSION }))
    log(`relinquishing port ${PORT} to a newer bridge; forwarding future pushes`)
    // Let the response flush before releasing the socket.
    setTimeout(() => {
      closeAll()
      onRelinquishCb?.()
    }, 100)
    return
  }

  if (url === '/__antivibe/docs') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(getDocs()))
    return
  }

  // Legacy single-doc catch-up: newest only. Kept so an older cached app bundle
  // still hydrates; current clients use /__antivibe/docs for the full library.
  if (url === '/__antivibe/doc') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(getDoc()))
    return
  }

  if (url === '/__antivibe/ingest' && method === 'POST') {
    try {
      const doc = JSON.parse(await readBody(req)) as AntiVibeDoc
      addDoc(doc) // fires onDocument -> forward to SSE + open-on-first-push
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true, clients: sseClients.size }))
    } catch (err) {
      log('ingest error:', err)
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Bad ingest payload')
    }
    return
  }

  // Reserved for phase 2: human review comments flow back to the agent here.
  if (url === '/__antivibe/feedback' && method === 'POST') {
    res.writeHead(501, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Feedback channel not implemented yet (phase 2)')
    return
  }

  // --- static SPA from dist/ ---
  if (method !== 'GET') return notFound(res)

  if (!(await distExists())) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(PLACEHOLDER)
    return
  }

  const file = resolveStatic(url)
  if (file && (await serveFile(res, file))) return

  // SPA fallback: any unknown non-API route serves index.html.
  if (await serveFile(res, path.join(DIST_DIR, 'index.html'))) return
  notFound(res)
}

/**
 * Forward each pushed doc to every connected tab; if none are connected, open a
 * browser once (re-armed whenever a tab later connects then leaves).
 */
function wireDocForwarding(): void {
  onDocument((doc) => {
    for (const client of sseClients) send(client, doc)
    if (sseClients.size === 0 && !pendingOpen) {
      pendingOpen = true
      openBrowser(BRIDGE_URL)
    }
  })
}

/**
 * Bind the bridge HTTP server. Resolves once listening; rejects with an Error
 * whose `code` is 'EADDRINUSE' when the port is already taken.
 */
export function startBridge(): Promise<void> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        log('request error:', err)
        if (!res.headersSent) res.writeHead(500)
        res.end()
      })
    })
    srv.once('error', reject)
    srv.listen(PORT, HOST, () => {
      srv.removeListener('error', reject)
      server = srv
      wireDocForwarding()
      process.on('SIGINT', () => {
        closeAll()
        process.exit(0)
      })
      process.on('SIGTERM', () => {
        closeAll()
        process.exit(0)
      })
      distExists().then((ok) => {
        if (!ok) log('warning: dist/ not found — run `npm run build`. Serving placeholder.')
      })
      log(`bridge listening on ${BRIDGE_URL} (v${VERSION})`)
      resolve()
    })
  })
}

/**
 * Probe the port. Returns the existing Anti-Vibe bridge's health (with its
 * version) when one owns it, or null when the port is free / held by something
 * else. A pre-handshake bridge omits `version`, so we default it to '0.0.0' —
 * making any newer server treat it as older and reclaim the port.
 */
export function probeBridge(): Promise<{ version: string } | null> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: HOST, port: PORT, path: '/__antivibe/health', timeout: 1500 },
      (res) => {
        let body = ''
        res.on('data', (d) => (body += d))
        res.on('end', () => {
          try {
            const h = JSON.parse(body)
            resolve(h?.app === HEALTH_MARKER ? { version: String(h.version ?? '0.0.0') } : null)
          } catch {
            resolve(null)
          }
        })
      },
    )
    req.on('error', () => resolve(null))
    req.on('timeout', () => {
      req.destroy()
      resolve(null)
    })
  })
}

/** Ask the bridge currently on the port to shut down (version handshake). Never
 *  rejects — the peer may drop the connection as it exits, which is success. */
export function postShutdown(): Promise<void> {
  return new Promise((resolve) => {
    const req = http.request(
      { host: HOST, port: PORT, path: '/__antivibe/shutdown', method: 'POST', timeout: 2000 },
      (res) => {
        res.resume()
        res.on('end', () => resolve())
      },
    )
    req.on('error', () => resolve())
    req.on('timeout', () => {
      req.destroy()
      resolve()
    })
    req.end()
  })
}

/** Forward a doc to the already-running bridge (used when we don't own the port). */
export function postIngest(doc: AntiVibeDoc): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(doc)
    const req = http.request(
      {
        host: HOST,
        port: PORT,
        path: '/__antivibe/ingest',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
        timeout: 3000,
      },
      (res) => {
        res.resume()
        res.on('end', () => resolve())
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy(new Error('ingest timeout'))
    })
    req.end(payload)
  })
}
