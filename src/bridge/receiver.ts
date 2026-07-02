import { useReader } from '../store/readerStore'
import { useFlow } from '../store/flowStore'
import type { FlowReviewDoc } from '../lib/types'

/**
 * Receives documents pushed by the Anti-Vibe MCP bridge and loads them into the
 * reader. The bridge serves this very app from its own origin, so all requests
 * are relative (no CORS). When the app is served from anywhere else (the
 * deployed PWA, `vite dev` on :5173), the `/__antivibe/*` routes don't exist — the
 * catch-up probe fails and we never open the SSE stream, so this is a silent
 * no-op everywhere except behind the bridge.
 */

interface PushedMarkdownDoc {
  documentId: string
  markdown: string
  title?: string
}

type PushedDoc = PushedMarkdownDoc | FlowReviewDoc

let lastDocId: string | null = null

function loadDoc(doc: PushedDoc | null): void {
  if (!doc) return
  // Dedupe so a re-sent doc (e.g. SSE replay on connect) doesn't reset the
  // view while the human is mid-review.
  if (doc.documentId && doc.documentId === lastDocId) return

  if ('kind' in doc && doc.kind === 'flow-review') {
    lastDocId = doc.documentId
    useReader.getState().exit() // ensure only one mode is active
    useFlow.getState().loadFlow(doc)
    return
  }

  const md = doc as PushedMarkdownDoc
  if (!md.markdown) return
  lastDocId = md.documentId ?? null
  useFlow.getState().exitFlow()
  useReader.getState().load(md.markdown)
}

function subscribe(): void {
  const es = new EventSource('/__antivibe/events')
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
  fetch('/__antivibe/doc')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no bridge'))))
    .then((doc: PushedDoc | null) => {
      loadDoc(doc)
      subscribe()
    })
    .catch(() => {
      /* not behind the bridge — silent no-op */
    })
}
