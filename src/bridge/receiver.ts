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
 *  auto-open. */
function screenIsEmpty(): boolean {
  return useReader.getState().tokens.length === 0 && useFlow.getState().stops.length === 0
}

/** Already in this tab (reader library or flow switcher) — an SSE replay, not a new push. */
function isKnown(doc: PushedDoc): boolean {
  return (
    useReader.getState().library.some((d) => d.documentId === doc.documentId) ||
    useFlow.getState().reviews.some((r) => r.documentId === doc.documentId)
  )
}

/** A live push takes the screen when the screen is empty, or when it's new and
 *  this window isn't the one the human is using (they sent it from their
 *  terminal and will come back to read it). While they're using this window it
 *  only joins the switcher (unread), so they're never yanked mid-read. */
function shouldForegroundLive(doc: PushedDoc): boolean {
  return screenIsEmpty() || (!isKnown(doc) && !document.hasFocus())
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
 *  - markdown  → retained as its own reader-library entry (deduped in the
 *    store's receiveDoc), so a re-sent doc — SSE replay on connect, or a
 *    re-probe — is idempotent and never clobbers the doc being read.
 *  - flow-review → listed in the review switcher, and loaded into the flow store
 *    when it takes the screen.
 * Which push takes the screen: on catch-up, the newest doc; live, see
 * shouldForegroundLive.
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

function receive(doc: PushedDoc | null, foreground: boolean): void {
  if (!doc || !doc.documentId) return
  if (isFlow(doc)) {
    // Always list it in the switcher (idempotent upsert); otherwise it waits
    // silently to be picked.
    useFlow.getState().addReview(metaOfFlow(doc, true))
    if (foreground) {
      useReader.getState().exit() // ensure the reader isn't holding a stale mode
      useFlow.getState().loadFlow(doc)
    }
    return
  }
  if (!doc.markdown) return
  if (foreground) useFlow.getState().exitFlow() // reveal the reader
  // The reader store retains every markdown push and lists it as unread unless
  // it opens now.
  useReader.getState().receiveDoc(doc, foreground)
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
      const doc: PushedDoc = JSON.parse((ev as MessageEvent).data)
      receive(doc, shouldForegroundLive(doc))
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
        // Newest first, so the doc that opens into the empty screen is the
        // latest push (the bridge lists oldest first). Catch-up never uses the
        // focus rule: a tab loading in the background would otherwise open
        // every doc in turn.
        const newestFirst = [...docs].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        for (const doc of newestFirst) receive(doc, screenIsEmpty())
      }
      subscribe()
    })
    .catch(() => {
      /* not behind the bridge — silent no-op */
    })
}
