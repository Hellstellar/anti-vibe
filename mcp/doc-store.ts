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
 * In-memory single-document store + event bus. This is the seam phase 2
 * (feedback) extends: the same emitter will carry `feedback` events keyed by
 * documentId back toward the MCP layer.
 */
const emitter = new EventEmitter()
let current: AntiVibeDoc | null = null

/** Build a AntiVibeDoc from normalized markdown + optional title. */
export function makeDoc(markdown: string, title: string): AntiVibeDoc {
  return { documentId: randomUUID(), title, markdown, createdAt: Date.now() }
}

/** Set the current document and notify listeners (SSE forwarder, browser-open). */
export function setDoc(doc: AntiVibeDoc): void {
  current = doc
  emitter.emit('document', doc)
}

/** The most recently pushed document, for catch-up when a tab connects late. */
export function getDoc(): AntiVibeDoc | null {
  return current
}

/** Subscribe to document pushes. Returns an unsubscribe function. */
export function onDocument(cb: (doc: AntiVibeDoc) => void): () => void {
  emitter.on('document', cb)
  return () => emitter.off('document', cb)
}
