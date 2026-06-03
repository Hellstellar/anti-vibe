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
  /** True when this word belongs to a list item (distinct styling). */
  listItem: boolean
  /** True only for the FIRST word of a list item (drives the bullet animation). */
  listItemStart: boolean
  /** True when a line break (soft or hard) precedes this word in the source. */
  breakBefore: boolean
  /** Position in the global token stream (counts atomic tokens too). */
  index: number
  /** Ordinal among WORD tokens only — drives the WPM ramp. */
  wordIndex: number
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

/** A heading and the blocks beneath it (until the next heading). */
export interface Section {
  id: number
  /** Heading text, or '' for leading content before the first heading. */
  title: string
  hasHeading: boolean
  /** Inclusive block-index range. */
  blockStart: number
  blockEnd: number
  /** Inclusive token-index range. */
  tokenStart: number
  tokenEnd: number
}

export interface ParseResult {
  tokens: Token[]
  blocks: Block[]
  sections: Section[]
}

/** Runtime-tunable playback configuration (persisted to localStorage). */
export interface ReaderConfig {
  startWpm: number
  targetWpm: number
  rampWords: number
  /** Words shown per flash. */
  chunkSize: number
  /** Radius (px) of the fully-lit core of the cursor spotlight. */
  spotlightRadius: number
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
  | 'section'
  | 'playing'
