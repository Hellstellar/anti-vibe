import type { RootContent } from 'mdast'

/** Inline emphasis marks carried by a word, for styling the giant flash. */
export type Emphasis = 'em' | 'strong'

/** Selectable look-and-feel. Each id has a matching [data-theme] block in
 *  theme.css and an entry in the THEMES registry (lib/theme.ts). */
export type ThemeId = 'crt' | 'cream'

/** Reading-prose text alignment. Drives the [data-align] attribute and thus
 *  the --text-align CSS variable. Each theme has a default (see ThemeMeta).
 *  The value set is defined once here (RS-20.5) and referenced everywhere. */
export const TEXT_ALIGNS = ['left', 'center'] as const
export type TextAlign = (typeof TEXT_ALIGNS)[number]

/** How in-text symbols (brackets, dashes, quotes) are presented during RSVP.
 *  'show' = verbatim; 'dim' = recessed but visible (no info loss); 'strip' =
 *  wrapping punctuation removed from the flash (lossy, opt-in). Defined once
 *  (RS-20.5) and referenced everywhere. */
export const SYMBOL_MODES = ['show', 'dim', 'strip'] as const
export type SymbolMode = (typeof SYMBOL_MODES)[number]

/** A single word (or punctuation-attached chunk) shown during RSVP playback. */
export interface WordToken {
  kind: 'word'
  /** Visible text including attached punctuation, e.g. "Anyway," */
  text: string
  /** Letters/digits only, used for ORP pivot + length-based timing. */
  clean: string
  /** True for an inline code span (`like.this()`): kept whole (not split on
   *  whitespace), flashed solo as a monospace hold frame during RSVP. */
  code: boolean
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
  /** Containment breadcrumb, outermost→innermost (e.g. ['LIST','LIST'] for a
   *  nested item, ['LIST','PARAGRAPH'] for a sub-paragraph). Drives the
   *  step-view hierarchy label. */
  crumbs: string[]
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

/** Which lane a flow-review stop belongs to. `flow` files are traversed top→bottom
 *  in runtime call order; `foundation` files (models/schemas/contracts/types) sit
 *  in a pinned lane and are listed bottom→up. */
export type FlowLayer = 'flow' | 'foundation'

/** How confidently the MCP tool matched a stop's locator to a real git-diff hunk. */
export type MatchStatus = 'exact' | 'fuzzy' | 'missing'

/** One resolved diff hunk of a file. The focus view shows these one at a time. */
export interface ResolvedHunk {
  /** The `@@ ... @@` header line. */
  header: string
  /** Verbatim unified-diff text for this hunk (including the header line). */
  diffText: string
  /** 1-based line in the new file this hunk starts at (for "open in editor"). */
  line: number
}

/** A review stop after the MCP tool has resolved its file's hunks from git.
 *  A stop maps to a FILE; the frontend steps through `hunks` one at a time.
 *  The agent never sends `hunks`/`matchStatus`. */
export interface ResolvedFlowStop {
  id: string
  file: string
  layer: FlowLayer
  /** Short human title/role for the stop, e.g. "Route handler". */
  title: string
  /** Markdown prose explaining the change (rendered statically). */
  explanation: string
  /** One-line gist shown as a caption for the stop. */
  oneLineSummary: string
  /** Ids of stops this one calls into (drives the sequence connectors). */
  callsTo?: string[]
  /** All of the file's diff hunks, in source order. Empty when `missing` or `context`. */
  hunks: ResolvedHunk[]
  /** Overall match confidence of the stop's locator hint. */
  matchStatus: MatchStatus
  /** A connective step with no change — shown so the runtime flow reads
   *  continuously. Rendered dimmed, with no diff / stepper / editor link. */
  context?: boolean
  /** Absolute path on the machine that ran the review, for "open in editor".
   *  Undefined when the repo path could not be resolved. */
  absPath?: string
}

/** A flow-ordered code review pushed into Anti-Vibe. Discriminated from the
 *  markdown reader doc by `kind`. */
export interface FlowReviewDoc {
  kind: 'flow-review'
  documentId: string
  title: string
  createdAt: number
  stops: ResolvedFlowStop[]
}

/** Runtime-tunable playback configuration (persisted to localStorage). */
export interface ReaderConfig {
  startWpm: number
  targetWpm: number
  rampWords: number
  /** Words shown per flash. */
  chunkSize: number
  /** Sound effects on interactions (waveform palette follows the theme). */
  soundOn: boolean
  /** Active visual + sound theme. */
  theme: ThemeId
  /** Reading-prose alignment. Defaults to the active theme's default on theme
   *  switch, but is an independent, user-overridable setting. */
  align: TextAlign
  /** How in-text symbols are presented during RSVP playback. */
  symbols: SymbolMode
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
  | 'stepping'

/** One screen in Step mode: a sentence, list item, table row, code or image. */
export type StepKind = 'sentence' | 'listItem' | 'tableRow' | 'code' | 'image' | 'quote'

export interface StepUnit {
  kind: StepKind
  /** Context label shown above the unit, e.g. "PARAGRAPH", "LIST · 2/4". */
  label: string
  /** Source block index — lets the view detect when the block changes. */
  groupId: number
  /** Words for sentence / listItem units. */
  words?: WordToken[]
  /** mdast node for code / image / table units. */
  node?: RootContent
  /** For tableRow: index into the table node's children (header is 0). */
  rowIndex?: number
}
