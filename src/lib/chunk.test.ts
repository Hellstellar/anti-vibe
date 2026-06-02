import { describe, it, expect } from 'vitest'
import { chunkAt, chunkDelay } from './chunk'
import { wordDelay, DEFAULT_CONFIG } from './timing'
import type { AtomicToken, Token, WordToken } from './types'

function word(text: string, index: number, blockId = 0): WordToken {
  return {
    kind: 'word',
    text,
    clean: text.replace(/[^\p{L}\p{N}]/gu, ''),
    blockId,
    emphasis: [],
    listItem: false,
    index,
  }
}

function atomic(index: number, blockId: number): AtomicToken {
  return {
    kind: 'atomic',
    blockType: 'code',
    node: { type: 'code', value: '' } as never,
    blockId,
    index,
  }
}

describe('chunkAt', () => {
  it('returns a single word with chunkSize 1', () => {
    const tokens: Token[] = [word('one', 0), word('two', 1)]
    const c = chunkAt(tokens, 0, 1)!
    expect(c.words).toHaveLength(1)
    expect(c.start).toBe(0)
    expect(c.end).toBe(0)
    expect(c.text).toBe('one')
  })

  it('gathers up to chunkSize contiguous words', () => {
    const tokens: Token[] = [
      word('a', 0),
      word('b', 1),
      word('c', 2),
      word('d', 3),
    ]
    const c = chunkAt(tokens, 0, 3)!
    expect(c.words.map((w) => w.text)).toEqual(['a', 'b', 'c'])
    expect(c.end).toBe(2)
    expect(c.text).toBe('a b c')
  })

  it('stops at a block boundary', () => {
    const tokens: Token[] = [
      word('a', 0, 0),
      word('b', 1, 0),
      word('c', 2, 1), // different block
    ]
    const c = chunkAt(tokens, 0, 5)!
    expect(c.words.map((w) => w.text)).toEqual(['a', 'b'])
    expect(c.end).toBe(1)
  })

  it('stops before an atomic token', () => {
    const tokens: Token[] = [word('a', 0), word('b', 1), atomic(2, 0)]
    const c = chunkAt(tokens, 0, 5)!
    expect(c.words.map((w) => w.text)).toEqual(['a', 'b'])
    expect(c.end).toBe(1)
  })

  it('returns null when start is an atomic token', () => {
    const tokens: Token[] = [atomic(0, 0), word('a', 1)]
    expect(chunkAt(tokens, 0, 3)).toBeNull()
  })

  it('returns null when start is out of range', () => {
    expect(chunkAt([word('a', 0)], 5, 1)).toBeNull()
  })

  it('flags listItem when any word is a list item', () => {
    const tokens: Token[] = [
      { ...word('item', 0), listItem: true },
      word('x', 1),
    ]
    expect(chunkAt(tokens, 0, 2)!.listItem).toBe(true)
  })
})

describe('chunkDelay', () => {
  it('sums the per-word delays of the chunk', () => {
    const tokens: Token[] = [word('hello', 0), word('there.', 1)]
    const c = chunkAt(tokens, 0, 2)!
    const expected =
      wordDelay(tokens[0] as WordToken, 0, DEFAULT_CONFIG) +
      wordDelay(tokens[1] as WordToken, 1, DEFAULT_CONFIG)
    expect(chunkDelay(c, DEFAULT_CONFIG)).toBeCloseTo(expected)
  })
})
