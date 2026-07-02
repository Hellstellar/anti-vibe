import { useReader } from '../store/readerStore'
import { useFlow } from '../store/flowStore'
import type { FlowReviewDoc, ReviewMeta } from '../lib/types'

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
    void refreshReviews() // a new push may add to the list
    return
  }

  const md = doc as PushedMarkdownDoc
  if (!md.markdown) return
  lastDocId = md.documentId ?? null
  useFlow.getState().exitFlow()
  useReader.getState().load(md.markdown)
}

/** Fetch the persisted review list into the switcher (flow reviews only). */
function refreshReviews(): Promise<void> {
  return fetch('/__antivibe/docs')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no bridge'))))
    .then((list: ReviewMeta[]) => {
      useFlow.getState().setReviews(list.filter((m) => m.kind === 'flow-review'))
    })
    .catch(() => {
      /* not behind the bridge — leave the list as-is */
    })
}

/** Load a specific stored review by id (used by the review switcher). */
export function openReview(id: string): void {
  fetch(`/__antivibe/doc?id=${encodeURIComponent(id)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
    .then((doc: FlowReviewDoc | null) => {
      if (doc && 'kind' in doc && doc.kind === 'flow-review') {
        lastDocId = doc.documentId
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
      void refreshReviews() // populate the switcher with all stored reviews
      subscribe()
    })
    .catch(() => {
      /* not behind the bridge — silent no-op */
    })
}
