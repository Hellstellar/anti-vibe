import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
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

/** Lightweight metadata for the review switcher (no diff/markdown payload). */
export interface DocMeta {
  documentId: string
  title: string
  createdAt: number
  kind: 'flow-review' | 'markdown'
  /** Stop count for flow reviews (0 for markdown). */
  stopCount: number
}

/** Cap on retained docs. Oldest is evicted (and its file removed) once exceeded. */
export const MAX_DOCS = 20

/**
 * Where pushed docs are persisted so they survive server restarts and are shared
 * across browser tabs / sessions. One JSON file per doc, keyed by documentId, so
 * markdown reviews and flow reviews sit side by side. Override with
 * ANTIVIBE_DATA_DIR (e.g. for tests).
 */
const DATA_DIR =
  process.env.ANTIVIBE_DATA_DIR || path.join(os.homedir(), '.anti-vibe', 'reviews')

/**
 * In-memory library + event bus. Every push is retained as its own entry (a
 * re-run after feedback sits alongside its predecessor rather than clobbering
 * it), so a reader can navigate between docs — markdown or flow — from one or
 * many sessions. Bounded to MAX_DOCS, oldest evicted first. Persisted per-file
 * to disk so the library survives a bridge restart. This is also the seam phase
 * 2 (feedback) extends: the same emitter will carry `feedback` events keyed by
 * documentId back toward the MCP layer.
 */
const emitter = new EventEmitter()
/** documentId → doc, ordered by insertion; latest push is the SSE catch-up doc. */
const docs = new Map<string, BridgeDoc>()
let latestId: string | null = null

/** STDOUT is the MCP protocol channel — diagnostics MUST go to stderr. */
function log(...args: unknown[]): void {
  console.error('[anti-vibe-mcp] doc-store:', ...args)
}

/** Load any persisted docs from disk into memory (best-effort, oldest first). */
export function loadFromDisk(): void {
  try {
    if (!existsSync(DATA_DIR)) return
    const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'))
    const loaded: BridgeDoc[] = []
    for (const f of files) {
      try {
        loaded.push(JSON.parse(readFileSync(path.join(DATA_DIR, f), 'utf-8')) as BridgeDoc)
      } catch {
        /* skip a corrupt file */
      }
    }
    loaded.sort((a, b) => a.createdAt - b.createdAt)
    docs.clear()
    for (const d of loaded) if (d.documentId) docs.set(d.documentId, d)
    while (docs.size > MAX_DOCS) evictOldest()
    latestId = docs.size ? [...docs.keys()][docs.size - 1] : null
    log(`restored ${docs.size} doc(s) from ${DATA_DIR}`)
  } catch {
    /* no persistence available — run in-memory only */
  }
}
loadFromDisk()

function persist(doc: BridgeDoc): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(path.join(DATA_DIR, `${doc.documentId}.json`), JSON.stringify(doc))
  } catch {
    /* disk unavailable — keep the in-memory copy anyway */
  }
}

/** Drop the oldest doc from memory + disk (called when over MAX_DOCS). */
function evictOldest(): void {
  const oldest = docs.keys().next().value as string | undefined
  if (!oldest) return
  const dropped = docs.get(oldest)
  docs.delete(oldest)
  try {
    unlinkSync(path.join(DATA_DIR, `${oldest}.json`))
  } catch {
    /* file already gone / disk unavailable */
  }
  if (dropped) log(`evicted oldest doc "${dropped.title}" (${oldest}); cap ${MAX_DOCS}`)
}

function metaOf(doc: BridgeDoc): DocMeta {
  const kind = 'kind' in doc && doc.kind === 'flow-review' ? 'flow-review' : 'markdown'
  return {
    documentId: doc.documentId,
    title: doc.title,
    createdAt: doc.createdAt,
    kind,
    stopCount: kind === 'flow-review' ? (doc as FlowReviewDoc).stops.length : 0,
  }
}

/** Build an AntiVibeDoc from normalized markdown + optional title. */
export function makeDoc(markdown: string, title: string): AntiVibeDoc {
  return { documentId: randomUUID(), title, markdown, createdAt: Date.now() }
}

/** Build a FlowReviewDoc from resolved stops + optional title. */
export function makeFlowDoc(stops: ResolvedFlowStop[], title: string): FlowReviewDoc {
  return { kind: 'flow-review', documentId: randomUUID(), title, stops, createdAt: Date.now() }
}

/**
 * Store a document (memory + disk) and notify listeners (SSE forwarder,
 * browser-open); it becomes the latest. Evicts the oldest entry when over
 * MAX_DOCS.
 */
export function setDoc(doc: BridgeDoc): void {
  docs.set(doc.documentId, doc)
  latestId = doc.documentId
  while (docs.size > MAX_DOCS) evictOldest()
  persist(doc)
  emitter.emit('document', doc)
}

/** The whole library, oldest first, for catch-up when a tab connects. */
export function getDocs(): BridgeDoc[] {
  return [...docs.values()]
}

/** The most recently pushed document, for catch-up when a tab connects late. */
export function getDoc(): BridgeDoc | null {
  return latestId ? docs.get(latestId) ?? null : null
}

/** A specific document by id (for the review switcher). */
export function getDocById(id: string): BridgeDoc | null {
  return docs.get(id) ?? null
}

/** Metadata for every stored document, newest first. */
export function listDocs(): DocMeta[] {
  return [...docs.values()].map(metaOf).sort((a, b) => b.createdAt - a.createdAt)
}

/** Subscribe to document pushes. Returns an unsubscribe function. */
export function onDocument(cb: (doc: BridgeDoc) => void): () => void {
  emitter.on('document', cb)
  return () => emitter.off('document', cb)
}
