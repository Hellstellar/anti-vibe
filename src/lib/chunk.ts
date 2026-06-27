import type { Token, WordToken } from './types'
import { wordDelay } from './timing'
import type { ReaderConfig } from './types'

export interface Chunk {
  /** First token index of the chunk. */
  start: number
  /** Last word-token index of the chunk (inclusive). */
  end: number
  words: WordToken[]
  /** Joined display text, single-spaced. */
  text: string
  /** True if any word in the chunk is a list item. */
  listItem: boolean
}

/**
 * Gather up to chunkSize contiguous word tokens starting at `start`,
 * staying within one block and stopping before any atomic token.
 * Returns null if `start` is not a word token.
 */
export function chunkAt(
  tokens: Token[],
  start: number,
  chunkSize: number,
): Chunk | null {
  const first = tokens[start]
  if (!first || first.kind !== 'word') return null

  const words: WordToken[] = [first]
  let end = start
  // A code span is always flashed solo (its own held frame); never group it with
  // surrounding prose words, in either direction.
  if (!first.code) {
    for (let i = start + 1; i < tokens.length && words.length < chunkSize; i++) {
      const t = tokens[i]
      if (t.kind !== 'word' || t.blockId !== first.blockId || t.code) break
      words.push(t)
      end = i
    }
  }

  return {
    start,
    end,
    words,
    text: words.map((w) => w.text).join(' '),
    listItem: words.some((w) => w.listItem),
  }
}

/**
 * Total dwell time for a chunk (sum of member word delays).
 * Ramp position is each word's offset from `rampStart` (the wordIndex where the
 * current play session began), so playback eases in again after every resume.
 */
export function chunkDelay(
  chunk: Chunk,
  cfg: ReaderConfig,
  rampStart = 0,
): number {
  return chunk.words.reduce(
    (sum, w) => sum + wordDelay(w, Math.max(0, w.wordIndex - rampStart), cfg),
    0,
  )
}
