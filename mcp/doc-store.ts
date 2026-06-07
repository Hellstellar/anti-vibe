import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'

/** One document pushed into Fixate for review. */
export interface FixateDoc {
  documentId: string
  title: string
  markdown: string
  createdAt: number
}

/**
 * In-memory single-document store + event bus. This is the seam phase 2
 * (feedback) extends: the same emitter will carry `feedback` events keyed by
 * documentId back toward the MCP layer.
 */
const emitter = new EventEmitter()
let current: FixateDoc | null = null

/** Build a FixateDoc from normalized markdown + optional title. */
export function makeDoc(markdown: string, title: string): FixateDoc {
  return { documentId: randomUUID(), title, markdown, createdAt: Date.now() }
}

/** Set the current document and notify listeners (SSE forwarder, browser-open). */
export function setDoc(doc: FixateDoc): void {
  current = doc
  emitter.emit('document', doc)
}

/** The most recently pushed document, for catch-up when a tab connects late. */
export function getDoc(): FixateDoc | null {
  return current
}

/** Subscribe to document pushes. Returns an unsubscribe function. */
export function onDocument(cb: (doc: FixateDoc) => void): () => void {
  emitter.on('document', cb)
  return () => emitter.off('document', cb)
}
