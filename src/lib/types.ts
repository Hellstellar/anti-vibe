import type { RootContent } from 'mdast'

/** Inline emphasis marks carried by a word, for styling the giant flash. */
export type Emphasis = 'em' | 'strong'

/** A single word (or punctuation-attached chunk) shown during RSVP playback. */
export interface WordToken {
  kind: 'word'
  /** Visible text including attached punctuation, e.g. "Anyway," */
  text: string
  /** Letters/digits only, used for ORP pivot + length-based timing. */
  clean: string
  /** Index into the parallel blocks[] array. */
  blockId: number
  /** Active inline emphasis marks. */
  emphasis: Emphasis[]
  /** True when this word belongs to a list item (distinct animation). */
  listItem: boolean
  /** Position in the global token stream. */
  index: number
}

/** A block rendered as-is that auto-pauses playback when reached. */
export interface AtomicToken {
  kind: 'atomic'
  blockType: 'heading' | 'code' | 'table' | 'image'
  /** Original mdast node, re-rendered during the pause. */
  node: RootContent
  blockId: number
  index: number
}

export type Token = WordToken | AtomicToken

/** A top-level source block, used to render surrounding context during pause. */
export interface Block {
  id: number
  type: string
  node: RootContent
  /** Inclusive range of token indices belonging to this block. */
  tokenStart: number
  tokenEnd: number
}

export interface ParseResult {
  tokens: Token[]
  blocks: Block[]
}

/** Runtime-tunable playback configuration (persisted to localStorage). */
export interface ReaderConfig {
  startWpm: number
  targetWpm: number
  rampWords: number
  /** Words shown per flash. */
  chunkSize: number
  multipliers: {
    longWordPerChar: number
    softPunct: number
    hardPunct: number
    closing: number
    digit: number
  }
}

export type ReaderMode =
  | 'idle'
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'atomic'
