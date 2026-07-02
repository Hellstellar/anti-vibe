import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { FlowReviewDoc, ResolvedFlowStop } from '../src/lib/types'

/** A markdown document pushed into the Anti-Vibe reader for review. */
export interface AntiVibeDoc {
  documentId: string
  title: string
  markdown: string
  createdAt: number
}

/** Anything the bridge carries to the frontend, discriminated by shape/`kind`. */
export type BridgeDoc = AntiVibeDoc | FlowReviewDoc

export type { FlowReviewDoc, ResolvedFlowStop }

/**
 * In-memory single-document store + event bus. This is the seam phase 2
 * (feedback) extends: the same emitter will carry `feedback` events keyed by
 * documentId back toward the MCP layer.
 */
const emitter = new EventEmitter()
let current: BridgeDoc | null = null

/** Build a AntiVibeDoc from normalized markdown + optional title. */
export function makeDoc(markdown: string, title: string): AntiVibeDoc {
  return { documentId: randomUUID(), title, markdown, createdAt: Date.now() }
}

/** Build a FlowReviewDoc from resolved stops + optional title. */
export function makeFlowDoc(stops: ResolvedFlowStop[], title: string): FlowReviewDoc {
  return { kind: 'flow-review', documentId: randomUUID(), title, stops, createdAt: Date.now() }
}

/** Set the current document and notify listeners (SSE forwarder, browser-open). */
export function setDoc(doc: BridgeDoc): void {
  current = doc
  emitter.emit('document', doc)
}

/** The most recently pushed document, for catch-up when a tab connects late. */
export function getDoc(): BridgeDoc | null {
  return current
}

/** Subscribe to document pushes. Returns an unsubscribe function. */
export function onDocument(cb: (doc: BridgeDoc) => void): () => void {
  emitter.on('document', cb)
  return () => emitter.off('document', cb)
}
