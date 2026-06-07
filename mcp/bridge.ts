import http from 'node:http'
import { promises as fs } from 'node:fs'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { getDoc, onDocument, setDoc, type FixateDoc } from './doc-store'

export const HOST = '127.0.0.1'
export const PORT = Number(process.env.FIXATE_MCP_PORT) || 7777
export const BRIDGE_URL = `http://${HOST}:${PORT}/`

const HEALTH_MARKER = 'fixate-bridge'
const here = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(here, '..', 'dist')

/** STDOUT is the MCP protocol channel — all diagnostics MUST go to stderr. */
export function log(...args: unknown[]): void {
  console.error('[fixate-mcp]', ...args)
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

const PLACEHOLDER = `<!doctype html><meta charset=utf-8><title>Fixate bridge</title>
<body style="font:16px ui-monospace,monospace;background:#0a0705;color:#e8d9c0;padding:3rem">
<h1>Fixate not built</h1>
<p>The MCP bridge is running, but <code>dist/</code> was not found.</p>
<p>Run <code>npm run build</code> in the Fixate repo, then reload.</p>
</body>`

/** Active SSE responses; size drives open-on-first-push. */
const sseClients = new Set<http.ServerResponse>()
/** True after we've opened a browser and are waiting for it to connect. */
let pendingOpen = false

function send(res: http.ServerResponse, doc: FixateDoc): void {
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
  // Late-connecting tab: replay the current doc so it hydrates immediately.
  const doc = getDoc()
  if (doc) send(res, doc)
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

  // --- bridge API (under /__fixate) ---
  if (url === '/__fixate/events') return handleSse(req, res)

  if (url === '/__fixate/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ app: HEALTH_MARKER, clients: sseClients.size }))
    return
  }

  if (url === '/__fixate/doc') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(getDoc()))
    return
  }

  if (url === '/__fixate/ingest' && method === 'POST') {
    try {
      const doc = JSON.parse(await readBody(req)) as FixateDoc
      setDoc(doc) // fires onDocument -> forward to SSE + open-on-first-push
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
  if (url === '/__fixate/feedback' && method === 'POST') {
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
    const server = http.createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        log('request error:', err)
        if (!res.headersSent) res.writeHead(500)
        res.end()
      })
    })
    server.once('error', reject)
    server.listen(PORT, HOST, () => {
      server.removeListener('error', reject)
      wireDocForwarding()
      const closeAll = () => {
        for (const c of sseClients) c.end()
        server.close()
      }
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
      log(`bridge listening on ${BRIDGE_URL}`)
      resolve()
    })
  })
}

/** Probe whether an existing Fixate bridge already owns the port. */
export function probeBridge(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: HOST, port: PORT, path: '/__fixate/health', timeout: 1500 },
      (res) => {
        let body = ''
        res.on('data', (d) => (body += d))
        res.on('end', () => {
          try {
            resolve(JSON.parse(body)?.app === HEALTH_MARKER)
          } catch {
            resolve(false)
          }
        })
      },
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

/** Forward a doc to the already-running bridge (used when we don't own the port). */
export function postIngest(doc: FixateDoc): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(doc)
    const req = http.request(
      {
        host: HOST,
        port: PORT,
        path: '/__fixate/ingest',
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
