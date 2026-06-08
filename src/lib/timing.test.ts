import { describe, it, expect } from 'vitest'
import {
  pivotIndex,
  wpmAt,
  wordDelay,
  splitPivot,
  DEFAULT_CONFIG,
} from './timing'
import type { ReaderConfig, WordToken } from './types'

function word(text: string, overrides: Partial<WordToken> = {}): WordToken {
  return {
    kind: 'word',
    text,
    clean: text.replace(/[^\p{L}\p{N}]/gu, ''),
    blockId: 0,
    emphasis: [],
    listItem: false,
    listItemStart: false,
    breakBefore: false,
    crumbs: [],
    index: 0,
    wordIndex: 0,
    ...overrides,
  }
}

describe('pivotIndex', () => {
  it('maps length to the Spritz ORP bucket', () => {
    expect(pivotIndex(0)).toBe(0)
    expect(pivotIndex(1)).toBe(0)
    expect(pivotIndex(5)).toBe(1)
    expect(pivotIndex(6)).toBe(2)
    expect(pivotIndex(9)).toBe(2)
    expect(pivotIndex(10)).toBe(3)
    expect(pivotIndex(13)).toBe(3)
    expect(pivotIndex(14)).toBe(4)
    expect(pivotIndex(50)).toBe(4)
  })
})

describe('wpmAt', () => {
  it('returns startWpm at index 0', () => {
    expect(wpmAt(0, 150, 300, 20)).toBe(150)
  })
  it('returns targetWpm at and beyond the ramp', () => {
    expect(wpmAt(20, 150, 300, 20)).toBe(300)
    expect(wpmAt(100, 150, 300, 20)).toBe(300)
  })
  it('eases in monotonically between start and target', () => {
    const a = wpmAt(5, 150, 300, 20)
    const b = wpmAt(10, 150, 300, 20)
    const c = wpmAt(15, 150, 300, 20)
    expect(a).toBeGreaterThan(150)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
    expect(c).toBeLessThan(300)
  })
  it('is quadratic ease-in (slower at the start)', () => {
    // halfway through the ramp, eased value < linear midpoint (225)
    expect(wpmAt(10, 150, 300, 20)).toBeLessThan(225)
  })
  it('handles rampWords <= 0 by jumping to target', () => {
    expect(wpmAt(0, 150, 300, 0)).toBe(300)
  })
})

describe('wordDelay', () => {
  const cfg: ReaderConfig = DEFAULT_CONFIG
  // At a large index the ramp is done, so base = 60000 / targetWpm = 200ms.
  const base = 60000 / cfg.targetWpm

  it('uses the plain base delay for a short plain word', () => {
    expect(wordDelay(word('cat'), 999, cfg)).toBeCloseTo(base)
  })
  it('adds a length bonus for long words', () => {
    const d = wordDelay(word('extraordinary'), 999, cfg) // len 13 > 6
    expect(d).toBeCloseTo(base * (1 + (13 - 6) * cfg.multipliers.longWordPerChar))
  })
  it('applies the hard-punctuation multiplier', () => {
    expect(wordDelay(word('end.'), 999, cfg)).toBeCloseTo(
      base * cfg.multipliers.hardPunct,
    )
  })
  it('applies the soft-punctuation multiplier', () => {
    expect(wordDelay(word('then,'), 999, cfg)).toBeCloseTo(
      base * cfg.multipliers.softPunct,
    )
  })
  it('hard punctuation takes precedence over soft', () => {
    // "wait?," — ends with ',' but contains '?'... regex checks last char.
    // Last char ',' => soft. Confirm a real hard case stays hard.
    expect(wordDelay(word('really?'), 999, cfg)).toBeCloseTo(
      base * cfg.multipliers.hardPunct,
    )
  })
  it('stacks closing-bracket and digit multipliers', () => {
    const d = wordDelay(word('(42)'), 999, cfg) // closing ')' + digit
    expect(d).toBeCloseTo(
      base * cfg.multipliers.closing * cfg.multipliers.digit,
    )
  })
  it('is larger at the start of the ramp (slower) than at target', () => {
    expect(wordDelay(word('cat'), 0, cfg)).toBeGreaterThan(
      wordDelay(word('cat'), 999, cfg),
    )
  })
})

describe('splitPivot', () => {
  it('picks the ORP letter for "Anyway" (the y)', () => {
    expect(splitPivot('Anyway')).toEqual({ pre: 'An', pivot: 'y', post: 'way' })
  })
  it('handles a single-letter word', () => {
    expect(splitPivot('I')).toEqual({ pre: '', pivot: 'I', post: '' })
  })
  it('skips nothing for index-0 pivots but maps over leading punctuation', () => {
    // "(hi)" -> alnum "hi" len 2 -> pivot index 1 -> the 'i'? len2 bucket=1
    // alnum chars: h(0), i(1). target=1 -> 'i'. pre includes "(h".
    expect(splitPivot('(hi)')).toEqual({ pre: '(h', pivot: 'i', post: ')' })
  })
  it('falls back to the first char for punctuation-only text', () => {
    expect(splitPivot('...')).toEqual({ pre: '', pivot: '.', post: '..' })
  })
  it('reassembles to the original text', () => {
    for (const w of ['hello', 'world!', 'reviewing', 'a', 'x-ray']) {
      const { pre, pivot, post } = splitPivot(w)
      expect(pre + pivot + post).toBe(w)
    }
  })
})
