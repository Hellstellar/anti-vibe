import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'

/** One document pushed into Anti-Vibe for review. */
export interface AntiVibeDoc {
  documentId: string
  title: string
  markdown: string
  createdAt: number
}

/**
 * In-memory document library + event bus. Every push is retained as its own
 * entry (a re-run after feedback sits alongside its predecessor rather than
 * clobbering it) so a reader can navigate between docs from one or many
 * sessions. Bounded to MAX_DOCS, oldest evicted first — the library is
 * process-local and clears on bridge restart (disk-backed persistence is a
 * deferred concern for a local review tool). This is also the seam phase 2
 * (feedback) extends: the same emitter will carry `feedback` events keyed by
 * documentId back toward the MCP layer.
 */
const emitter = new EventEmitter()

/** Cap on retained docs. Oldest is evicted once exceeded. */
export const MAX_DOCS = 20

/** Received documents, oldest first. Newest is docs[docs.length - 1]. */
const docs: AntiVibeDoc[] = []

/** STDOUT is the MCP protocol channel — diagnostics MUST go to stderr. */
function log(...args: unknown[]): void {
  console.error('[anti-vibe-mcp] doc-store:', ...args)
}

/** Build an AntiVibeDoc from normalized markdown + optional title. */
export function makeDoc(markdown: string, title: string): AntiVibeDoc {
  return { documentId: randomUUID(), title, markdown, createdAt: Date.now() }
}

/**
 * Append a document to the library and notify listeners (SSE forwarder,
 * browser-open). Evicts the oldest entry when over MAX_DOCS.
 */
export function addDoc(doc: AntiVibeDoc): void {
  docs.push(doc)
  while (docs.length > MAX_DOCS) {
    const dropped = docs.shift()
    if (dropped) log(`evicted oldest doc "${dropped.title}" (${dropped.documentId}); cap ${MAX_DOCS}`)
  }
  emitter.emit('document', doc)
}

/** The whole library, oldest first, for catch-up when a tab connects. */
export function getDocs(): AntiVibeDoc[] {
  return docs.slice()
}

/** The most recently pushed document, or null. Kept for the legacy single-doc
 *  catch-up route; new clients hydrate the full library via getDocs. */
export function getDoc(): AntiVibeDoc | null {
  return docs.length ? docs[docs.length - 1] : null
}

/** Subscribe to document pushes. Returns an unsubscribe function. */
export function onDocument(cb: (doc: AntiVibeDoc) => void): () => void {
  emitter.on('document', cb)
  return () => emitter.off('document', cb)
}
