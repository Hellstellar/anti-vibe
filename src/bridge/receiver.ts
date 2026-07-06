import { useReader } from '../store/readerStore'
import { useFlow } from '../store/flowStore'
import type { FlowReviewDoc, ReviewMeta } from '../lib/types'

/**
 * Receives documents pushed by the Anti-Vibe MCP bridge and feeds them into the
 * right store. The bridge serves this very app from its own origin, so all
 * requests are relative (no CORS). When the app is served from anywhere else
 * (the deployed PWA, `vite dev` on :5173), the `/__antivibe/*` routes don't
 * exist — the catch-up probe fails and we never open the SSE stream, so this is
 * a silent no-op everywhere except behind the bridge.
 *
 * A push is one of two kinds:
 *  - markdown  → retained as its own reader-library entry (dedupe + first-doc
 *    auto-load live in the store's receiveDoc), so a re-sent doc — SSE replay on
 *    connect, or a re-probe — is idempotent and never clobbers the doc being read.
 *  - flow-review → loaded into the flow store (the first one auto-opens); the
 *    store also appends it to the review switcher list.
 */

interface PushedMarkdownDoc {
  documentId: string
  markdown: string
  title?: string
  createdAt?: number
}

type PushedDoc = PushedMarkdownDoc | FlowReviewDoc

function isFlow(doc: PushedDoc): doc is FlowReviewDoc {
  return 'kind' in doc && doc.kind === 'flow-review'
}

/** The last flow review we loaded, so an SSE replay doesn't reset the view
 *  while the human is mid-review. Markdown dedupe lives in the reader store. */
let lastFlowId: string | null = null

function receive(doc: PushedDoc | null): void {
  if (!doc || !doc.documentId) return
  if (isFlow(doc)) {
    if (doc.documentId === lastFlowId) return
    lastFlowId = doc.documentId
    useReader.getState().exit() // stop reader timers; ensure one mode is active
    useFlow.getState().loadFlow(doc) // also appends to the switcher list
    return
  }
  if (!doc.markdown) return
  useReader.getState().receiveDoc(doc)
}

/** Derive the flow-review switcher list from the full library payload. */
function toReviewMeta(docs: PushedDoc[]): ReviewMeta[] {
  return docs
    .filter(isFlow)
    .map((d) => ({
      documentId: d.documentId,
      title: d.title,
      createdAt: d.createdAt,
      kind: 'flow-review' as const,
      stopCount: d.stops.length,
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** Load a specific stored review by id (used by the review switcher). */
export function openReview(id: string): void {
  fetch(`/__antivibe/doc?id=${encodeURIComponent(id)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
    .then((doc: FlowReviewDoc | null) => {
      if (doc && 'kind' in doc && doc.kind === 'flow-review') {
        lastFlowId = doc.documentId
        useReader.getState().exit()
        useFlow.getState().loadFlow(doc)
      }
    })
    .catch(() => {
      /* ignore — stale id or off the bridge */
    })
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
  // served by the bridge → hydrate every pending doc, populate the switcher,
  // and subscribe to live pushes. Any failure means we're not behind the bridge.
  fetch('/__antivibe/docs')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no bridge'))))
    .then((docs: PushedDoc[]) => {
      if (Array.isArray(docs)) {
        useFlow.getState().setReviews(toReviewMeta(docs))
        for (const doc of docs) receive(doc)
      }
      subscribe()
    })
    .catch(() => {
      /* not behind the bridge — silent no-op */
    })
}
