// Comment capture layer: doc identity, anchor build/resolve, persistence.
// Pure logic — no React, no UI. The store and the feedback-prompt / marker
// renderers all build on the CommentAnchor produced here.

import type { Block, Comment, CommentAnchor, CommentScope, Section, Token } from './types'

/** Chars of source context captured on either side of a quote. */
const CTX = 24

/** djb2 — small stable content hash for documents that arrive without a
 *  documentId (clipboard paste, opened file). */
function hashSrc(src: string): string {
  let h = 5381
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Stable key a document's comments are stored under. Prefers the bridge's
 *  documentId; falls back to a content hash so paste/file docs still persist. */
export function docKeyFor(src: string, documentId?: string): string {
  return documentId ?? `h_${hashSrc(src)}`
}

/** localStorage key for a document's comments (follows the antivibe- prefix). */
export const commentsKey = (docKey: string): string => `antivibe-comments:${docKey}`

/** Block's [startOffset, endOffset] in the source, or null if mdast attached
 *  no position (shouldn't happen for top-level blocks, but guarded). */
function blockOffsets(block: Block): [number, number] | null {
  const p = block.node.position
  if (!p || p.start.offset == null || p.end.offset == null) return null
  return [p.start.offset, p.end.offset]
}

interface AnchorInput {
  src: string
  tokens: Token[]
  blocks: Block[]
  sections: Section[]
  /** Inclusive token-index range being anchored. A point has start === end. */
  tokenStart: number
  tokenEnd: number
  /** 'document' is unanchored and handled by the caller (anchor stays null). */
  scope: Exclude<CommentScope, 'document'>
}

/** Join the word tokens in [start, end] into approximate anchor text. Used for
 *  'span' scope, where we have no exact char offsets per token. */
function joinWords(tokens: Token[], start: number, end: number): string {
  return tokens
    .slice(start, end + 1)
    .filter((t): t is Extract<Token, { kind: 'word' }> => t.kind === 'word')
    .map((t) => t.text)
    .join(' ')
}

/**
 * Build a durable anchor for a token range. block/section/document-of-one-block
 * scopes slice the exact source via mdast offsets (precise quote + real
 * prefix/suffix context). span scope joins token text (whitespace-approximate)
 * and omits context — it is re-located by quote uniqueness alone.
 */
export function buildAnchor(i: AnchorInput): CommentAnchor {
  const { src, tokens, blocks, sections, scope } = i
  const startTok = tokens[i.tokenStart]
  const block = blocks[startTok.blockId]
  const section =
    sections.find((s) => block.id >= s.blockStart && block.id <= s.blockEnd) ??
    sections[0]

  const base = {
    blockId: block.id,
    sectionId: section.id,
    sectionTitle: section.title,
    tokenStart: i.tokenStart,
    tokenEnd: i.tokenEnd,
  }

  if (scope !== 'span') {
    // block | section: exact source slice from the first block's start to the
    // last block's end. (section spans block..section.blockEnd; block is one.)
    const lastBlock = scope === 'section' ? blocks[section.blockEnd] : block
    const start = blockOffsets(block)
    const end = blockOffsets(lastBlock)
    if (start && end) {
      const [from] = start
      const [, to] = end
      return {
        ...base,
        quote: src.slice(from, to),
        prefix: src.slice(Math.max(0, from - CTX), from),
        suffix: src.slice(to, to + CTX),
      }
    }
    // No offsets — fall through to token-join.
  }

  return {
    ...base,
    quote: joinWords(tokens, i.tokenStart, i.tokenEnd),
    prefix: '',
    suffix: '',
  }
}

/**
 * Re-resolve a stored anchor against the current source by content, returning
 * fresh char offsets. Used on reload, when token indices may be stale against
 * an edited document. Tries prefix+quote+suffix (most specific), then the bare
 * quote, then null — an orphaned anchor whose text no longer exists.
 */
export function resolveAnchor(
  src: string,
  a: CommentAnchor,
): { from: number; to: number } | null {
  if (a.prefix || a.suffix) {
    const withCtx = src.indexOf(a.prefix + a.quote + a.suffix)
    if (withCtx >= 0) {
      const from = withCtx + a.prefix.length
      return { from, to: from + a.quote.length }
    }
  }
  const bare = src.indexOf(a.quote)
  if (bare >= 0) return { from: bare, to: bare + a.quote.length }
  return null
}

/** Restore a document's persisted comments. Tolerates missing/corrupt blobs. */
export function restoreComments(docKey: string): Comment[] {
  try {
    const raw = localStorage.getItem(commentsKey(docKey))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as Comment[]
    }
  } catch {
    /* ignore */
  }
  return []
}

/** Persist a document's comments. Silently no-ops if storage is unavailable. */
export function persistComments(docKey: string, comments: Comment[]): void {
  try {
    localStorage.setItem(commentsKey(docKey), JSON.stringify(comments))
  } catch {
    /* ignore */
  }
}
