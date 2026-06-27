import type { ReaderConfig, WordToken } from './types'

export const DEFAULT_CONFIG: ReaderConfig = {
  startWpm: 150,
  targetWpm: 300,
  rampWords: 20,
  chunkSize: 1,
  soundOn: true,
  theme: 'crt',
  align: 'center',
  symbols: 'dim',
  multipliers: {
    longWordPerChar: 0.04,
    softPunct: 1.5,
    hardPunct: 2.2,
    closing: 1.2,
    digit: 1.2,
  },
}

/**
 * Optimal Recognition Point letter index by clean word length.
 * Spritz-style. e.g. "Anyway" (len 6) -> 2 -> the 'y'.
 */
export function pivotIndex(len: number): number {
  if (len <= 1) return 0
  if (len <= 5) return 1
  if (len <= 9) return 2
  if (len <= 13) return 3
  return 4
}

/** Ease-in WPM ramp: slow start accelerating to target over rampWords. */
export function wpmAt(
  i: number,
  startWpm: number,
  targetWpm: number,
  rampWords: number,
): number {
  if (rampWords <= 0 || i >= rampWords) return targetWpm
  const t = i / rampWords
  const eased = t * t
  return startWpm + (targetWpm - startWpm) * eased
}

/** Per-word dwell time in ms, applying length + punctuation bonuses. */
export function wordDelay(
  token: WordToken,
  i: number,
  cfg: ReaderConfig,
): number {
  // A code span is held whole for a length-scaled dwell (no ramp/punct bonuses).
  if (token.code) return codeHoldDelay(token.text, cfg)

  const wpm = wpmAt(i, cfg.startWpm, cfg.targetWpm, cfg.rampWords)
  let ms = 60000 / wpm

  const L = token.clean.length
  if (L > 6) ms *= 1 + (L - 6) * cfg.multipliers.longWordPerChar

  const t = token.text
  if (/[.!?]$/.test(t)) ms *= cfg.multipliers.hardPunct
  else if (/[,;:]$/.test(t)) ms *= cfg.multipliers.softPunct
  if (/["')\]]$/.test(t)) ms *= cfg.multipliers.closing
  if (/\d/.test(t)) ms *= cfg.multipliers.digit

  return ms
}

/**
 * Split display text into [pre, pivot, post] where `pivot` is the single
 * ORP letter to highlight. Pivot is chosen on the alphanumeric-only length,
 * then mapped back to its position within the original display text.
 */
export function splitPivot(text: string): {
  pre: string
  pivot: string
  post: string
} {
  const alnum = text.replace(/[^\p{L}\p{N}]/gu, '')
  const target = pivotIndex(alnum.length)

  let count = 0
  for (let k = 0; k < text.length; k++) {
    if (/[\p{L}\p{N}]/u.test(text[k])) {
      if (count === target) {
        return { pre: text.slice(0, k), pivot: text[k], post: text.slice(k + 1) }
      }
      count++
    }
  }
  // No alphanumerics (pure punctuation) — highlight the first char.
  return { pre: '', pivot: text.slice(0, 1), post: text.slice(1) }
}

/** A single non-(letter/digit) character — a "symbol" for display purposes. */
const SYMBOL_CHAR = /[^\p{L}\p{N}]/u
/** A leading or trailing run of symbol characters (wrapping punctuation). */
const WRAPPING_SYMBOLS = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu

/**
 * Split display text into maximal alternating runs of word-chars vs symbols, so
 * the RSVP stage can recess the symbol runs ('dim' mode). Iterates by code point
 * so emoji/combined characters aren't split. Letters/digits get sym=false;
 * brackets, dashes, quotes, spaces get sym=true.
 */
export function segmentText(text: string): { text: string; sym: boolean }[] {
  const out: { text: string; sym: boolean }[] = []
  for (const ch of text) {
    const sym = SYMBOL_CHAR.test(ch)
    const last = out[out.length - 1]
    if (last && last.sym === sym) last.text += ch
    else out.push({ text: ch, sym })
  }
  return out
}

/**
 * Remove only the leading and trailing symbol runs (wrapping punctuation like
 * "(", ")", quotes) while keeping interior punctuation (apostrophes, hyphens).
 * Used by the lossy 'strip' symbol mode. Falls back to the original text if
 * stripping would leave nothing (e.g. a pure-symbol token).
 */
export function stripWrappingSymbols(text: string): string {
  const stripped = text.replace(WRAPPING_SYMBOLS, '')
  return stripped || text
}

/** Floor/ceiling for how long an inline-code span holds before auto-resuming. */
export const CODE_HOLD_MIN_MS = 400
export const CODE_HOLD_MAX_MS = 2500
const CODE_CHARS_PER_WORD = 4

/**
 * Dwell for an inline-code hold frame: scales with length (≈4 chars per "word"
 * at target pace), clamped to a sane min/max. Holds at target WPM — the ease-in
 * ramp doesn't apply to atomic tokens.
 */
export function codeHoldDelay(code: string, cfg: ReaderConfig): number {
  const base = 60000 / cfg.targetWpm
  const ms = base * (1 + code.length / CODE_CHARS_PER_WORD)
  return Math.min(CODE_HOLD_MAX_MS, Math.max(CODE_HOLD_MIN_MS, ms))
}
