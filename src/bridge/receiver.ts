import { useReader } from '../store/readerStore'

/**
 * Receives documents pushed by the Fixate MCP bridge and loads them into the
 * reader. The bridge serves this very app from its own origin, so all requests
 * are relative (no CORS). When the app is served from anywhere else (the
 * deployed PWA, `vite dev` on :5173), the `/__fixate/*` routes don't exist — the
 * catch-up probe fails and we never open the SSE stream, so this is a silent
 * no-op everywhere except behind the bridge.
 */

interface PushedDoc {
  documentId: string
  markdown: string
  title?: string
}

let lastDocId: string | null = null

function loadDoc(doc: PushedDoc | null): void {
  if (!doc || !doc.markdown) return
  // Dedupe so a re-sent doc (e.g. SSE replay on connect) doesn't reset the
  // reader while the human is mid-review.
  if (doc.documentId && doc.documentId === lastDocId) return
  lastDocId = doc.documentId ?? null
  useReader.getState().load(doc.markdown)
}

function subscribe(): void {
  const es = new EventSource('/__fixate/events')
  es.addEventListener('document', (ev) => {
    try {
      loadDoc(JSON.parse((ev as MessageEvent).data))
    } catch {
      /* ignore malformed frames */
    }
  })
  // Swallow errors; EventSource auto-reconnects if the bridge restarts.
  es.onerror = () => {}
}

export function connectBridge(): void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return
  // Probe the catch-up endpoint first. A 200 (even with a null body) means we're
  // served by the bridge → hydrate any pending doc and subscribe to live pushes.
  // Any failure means we're not behind the bridge → do nothing.
  fetch('/__fixate/doc')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no bridge'))))
    .then((doc: PushedDoc | null) => {
      loadDoc(doc)
      subscribe()
    })
    .catch(() => {
      /* not behind the bridge — silent no-op */
    })
}
