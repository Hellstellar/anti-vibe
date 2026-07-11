import { useReader } from '../store/readerStore'
import { useFlow } from '../store/flowStore'
import type { FlowReviewDoc, ReviewMeta } from '../lib/types'

/** Metadata for the review switcher, derived from a full flow-review doc.
 *  `unread` marks it as a new arrival until the human opens it. */
function metaOfFlow(doc: FlowReviewDoc, unread: boolean): ReviewMeta {
  return {
    documentId: doc.documentId,
    title: doc.title,
    createdAt: doc.createdAt,
    kind: 'flow-review',
    stopCount: doc.stops.length,
    unread,
  }
}

/** True when neither surface has anything loaded — an incoming doc may then
 *  auto-open. Once something is loaded, further pushes only join the switcher
 *  (unread) so the human is never yanked off what they're reading/reviewing. */
function screenIsEmpty(): boolean {
  return useReader.getState().tokens.length === 0 && useFlow.getState().stops.length === 0
}

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

function receive(doc: PushedDoc | null): void {
  if (!doc || !doc.documentId) return
  if (isFlow(doc)) {
    // Always list it in the switcher (idempotent upsert). Only foreground it
    // when the screen is empty — otherwise it waits silently to be picked, so a
    // push arriving mid-read/review never yanks the human off their work.
    useFlow.getState().addReview(metaOfFlow(doc, true))
    if (screenIsEmpty()) {
      useReader.getState().exit() // ensure the reader isn't holding a stale mode
      useFlow.getState().loadFlow(doc)
    }
    return
  }
  if (!doc.markdown) return
  // The reader store retains every markdown push; it auto-opens the first one
  // (guarded on a flow occupying the screen) and lists the rest as unread.
  useReader.getState().receiveDoc(doc)
}

/** Derive the flow-review switcher list from the full library payload. */
function toReviewMeta(docs: PushedDoc[]): ReviewMeta[] {
  return docs
    .filter(isFlow)
    .map((d) => metaOfFlow(d, true))
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** Foreground a stored flow review by id (from the switcher). Fetches the full
 *  doc (the switcher only holds metadata) and loads it, covering the reader.
 *  The reader's doc stays in its library, so switching back is a re-pick away. */
export function openReview(id: string): void {
  fetch(`/__antivibe/doc?id=${encodeURIComponent(id)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
    .then((doc: FlowReviewDoc | null) => {
      if (doc && 'kind' in doc && doc.kind === 'flow-review') {
        useReader.getState().exit() // stop any reader playback loop; reveal the flow
        useFlow.getState().loadFlow(doc)
      }
    })
    .catch(() => {
      /* ignore — stale id or off the bridge */
    })
}

/** Foreground a markdown doc by id (from the switcher). Tears down the flow
 *  surface (if any) so the reader shows, then loads the doc from the reader's
 *  own library — no fetch needed, and off the bridge it still works. */
export function openMarkdown(id: string): void {
  useFlow.getState().exitFlow()
  useReader.getState().switchTo(id)
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
