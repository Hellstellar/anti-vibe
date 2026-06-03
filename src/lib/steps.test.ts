import { describe, it, expect } from 'vitest'
import { splitSentences, buildSteps } from './steps'
import { parseMarkdown } from './parseMarkdown'
import type { WordToken } from './types'

function word(text: string, i: number): WordToken {
  return {
    kind: 'word',
    text,
    clean: text.replace(/[^\p{L}\p{N}]/gu, ''),
    blockId: 0,
    emphasis: [],
    listItem: false,
    listItemStart: false,
    breakBefore: false,
    index: i,
    wordIndex: i,
  }
}

describe('splitSentences', () => {
  it('breaks after . ! ?', () => {
    const ws = ['One.', 'Two', 'words.', 'Three!', 'Done?'].map(word)
    const out = splitSentences(ws).map((s) => s.map((w) => w.text).join(' '))
    expect(out).toEqual(['One.', 'Two words.', 'Three!', 'Done?'])
  })
  it('keeps a trailing fragment with no terminal punctuation', () => {
    const ws = ['no', 'end', 'here'].map(word)
    expect(splitSentences(ws)).toHaveLength(1)
  })
  it('handles closing quotes after the period', () => {
    const ws = ['He', 'said', 'hi."', 'Next', 'one.'].map(word)
    expect(splitSentences(ws).map((s) => s.length)).toEqual([3, 2])
  })
})

describe('buildSteps', () => {
  const build = (md: string) => {
    const { tokens, blocks, sections } = parseMarkdown(md)
    return buildSteps(tokens, blocks, sections[0])
  }

  it('splits a paragraph into one unit per sentence', () => {
    const u = build('# H\n\nFirst sentence. Second one here. Third.')
    expect(u.map((x) => x.kind)).toEqual(['sentence', 'sentence', 'sentence'])
    expect(u.every((x) => x.label === 'PARAGRAPH')).toBe(true)
  })

  it('makes one unit per list item with position labels', () => {
    const u = build('# H\n\n- alpha beta\n- gamma\n- delta')
    expect(u.map((x) => x.kind)).toEqual(['listItem', 'listItem', 'listItem'])
    expect(u.map((x) => x.label)).toEqual(['LIST · 1/3', 'LIST · 2/3', 'LIST · 3/3'])
  })

  it('makes one unit per table body row (skipping the header)', () => {
    const md = '# H\n\n| A | B |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |'
    const u = build(md)
    expect(u.map((x) => x.kind)).toEqual(['tableRow', 'tableRow'])
    expect(u.map((x) => x.label)).toEqual(['TABLE · ROW 1/2', 'TABLE · ROW 2/2'])
    expect(u.map((x) => x.rowIndex)).toEqual([1, 2])
  })

  it('emits a single unit for a code block', () => {
    const u = build('# H\n\n```js\nconst x = 1\n```')
    expect(u).toHaveLength(1)
    expect(u[0].kind).toBe('code')
  })

  it('returns no units for a heading-only section', () => {
    expect(build('# Just a heading')).toHaveLength(0)
  })
})
