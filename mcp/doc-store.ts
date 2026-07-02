import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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

/** Where pushed docs are persisted so they survive server restarts and are
 *  shared across browser tabs. Override with ANTIVIBE_DATA_DIR. */
const DATA_DIR =
  process.env.ANTIVIBE_DATA_DIR || path.join(os.homedir(), '.anti-vibe', 'reviews')

const emitter = new EventEmitter()
/** documentId → doc, ordered by insertion; latest push is the SSE catch-up doc. */
const docs = new Map<string, BridgeDoc>()
let latestId: string | null = null

/** Load any persisted docs from disk into memory (best-effort). */
function hydrate(): void {
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
    for (const d of loaded) if (d.documentId) docs.set(d.documentId, d)
    latestId = loaded.length ? loaded[loaded.length - 1].documentId : null
  } catch {
    /* no persistence available — run in-memory only */
  }
}
hydrate()

function persist(doc: BridgeDoc): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(path.join(DATA_DIR, `${doc.documentId}.json`), JSON.stringify(doc))
  } catch {
    /* disk unavailable — keep the in-memory copy anyway */
  }
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

/** Build a AntiVibeDoc from normalized markdown + optional title. */
export function makeDoc(markdown: string, title: string): AntiVibeDoc {
  return { documentId: randomUUID(), title, markdown, createdAt: Date.now() }
}

/** Build a FlowReviewDoc from resolved stops + optional title. */
export function makeFlowDoc(stops: ResolvedFlowStop[], title: string): FlowReviewDoc {
  return { kind: 'flow-review', documentId: randomUUID(), title, stops, createdAt: Date.now() }
}

/** Store a document (memory + disk) and notify listeners; it becomes the latest. */
export function setDoc(doc: BridgeDoc): void {
  docs.set(doc.documentId, doc)
  latestId = doc.documentId
  persist(doc)
  emitter.emit('document', doc)
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
