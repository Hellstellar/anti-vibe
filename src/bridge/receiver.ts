import { useReader } from '../store/readerStore'

/**
 * Receives documents pushed by the Anti-Vibe MCP bridge and feeds them into the
 * reader's document library. The bridge serves this very app from its own
 * origin, so all requests are relative (no CORS). When the app is served from
 * anywhere else (the deployed PWA, `vite dev` on :5173), the `/__antivibe/*`
 * routes don't exist — the catch-up probe fails and we never open the SSE
 * stream, so this is a silent no-op everywhere except behind the bridge.
 *
 * Every push is retained as its own library entry (dedupe + first-doc-auto-load
 * live in the store's receiveDoc), so a re-sent doc — SSE replay on connect, or
 * a re-probe — is idempotent, and a new push never clobbers the doc currently
 * being reviewed.
 */

interface PushedDoc {
  documentId: string
  markdown: string
  title?: string
  createdAt?: number
}

function receive(doc: PushedDoc | null): void {
  if (!doc || !doc.markdown || !doc.documentId) return
  useReader.getState().receiveDoc(doc)
}

function subscribe(): void {
  const es = new EventSource('/__antivibe/events')
  es.addEventListener('document', (ev) => {
    try {
      receive(JSON.parse((ev as MessageEvent).data))
    } catch {
      /* ignore malformed frames */
    }
  })
  // Swallow errors; EventSource auto-reconnects if the bridge restarts.
  es.onerror = () => {}
}

export function connectBridge(): void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return
  // Probe the library endpoint first. A 200 (even an empty array) means we're
  // served by the bridge → hydrate every pending doc and subscribe to live
  // pushes. Any failure means we're not behind the bridge → do nothing.
  fetch('/__antivibe/docs')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no bridge'))))
    .then((docs: PushedDoc[]) => {
      if (Array.isArray(docs)) for (const doc of docs) receive(doc)
      subscribe()
    })
    .catch(() => {
      /* not behind the bridge — silent no-op */
    })
}
