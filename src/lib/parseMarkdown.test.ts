import { describe, it, expect } from 'vitest'
import { parseMarkdown } from './parseMarkdown'
import type { AtomicToken, WordToken } from './types'

const words = (md: string) =>
  parseMarkdown(md).tokens.filter((t): t is WordToken => t.kind === 'word')
const atomics = (md: string) =>
  parseMarkdown(md).tokens.filter((t): t is AtomicToken => t.kind === 'atomic')

describe('parseMarkdown — atomic blocks', () => {
  it('treats a heading as an atomic block', () => {
    const a = atomics('# Hello World')
    expect(a).toHaveLength(1)
    expect(a[0].blockType).toBe('heading')
  })

  it('treats a fenced code block as atomic', () => {
    const a = atomics('```js\nconst x = 1\n```')
    expect(a).toHaveLength(1)
    expect(a[0].blockType).toBe('code')
  })

  it('treats a gfm table as atomic', () => {
    const md = '| A | B |\n| - | - |\n| 1 | 2 |'
    const a = atomics(md)
    expect(a).toHaveLength(1)
    expect(a[0].blockType).toBe('table')
  })

  it('treats an image-only paragraph as atomic', () => {
    const a = atomics('![alt text](pic.png)')
    expect(a).toHaveLength(1)
    expect(a[0].blockType).toBe('image')
  })

  it('keeps inline code as words, not an atomic block', () => {
    expect(atomics('use `npm run dev` to start')).toHaveLength(0)
    expect(words('use `npm run dev` to start').map((w) => w.text)).toContain(
      'npm',
    )
  })

  it('emits a fenced code block nested inside a list item as atomic (not dropped)', () => {
    const md = '- intro\n\n  ```js\n  const x = 1\n  ```'
    const a = atomics(md)
    expect(a.map((t) => t.blockType)).toContain('code')
  })

  it('emits an image-only paragraph inside a list item as an atomic image', () => {
    const a = atomics('- ![diagram](d.png)')
    expect(a.map((t) => t.blockType)).toContain('image')
  })
})

describe('parseMarkdown — words', () => {
  it('tokenizes a paragraph into words with attached punctuation', () => {
    const w = words('Hello, world!')
    expect(w.map((t) => t.text)).toEqual(['Hello,', 'world!'])
    expect(w[0].clean).toBe('Hello')
  })

  it('assigns a monotonic global index across the stream', () => {
    const tokens = parseMarkdown('# H\n\nfirst second').tokens
    expect(tokens.map((t) => t.index)).toEqual([0, 1, 2])
  })

  it('numbers wordIndex over words only, skipping atomic tokens', () => {
    // heading (atomic, no wordIndex) then two words.
    const w = words('# Heading\n\nfirst second')
    expect(w.map((t) => t.wordIndex)).toEqual([0, 1])
    // global index skips past the heading token.
    expect(w.map((t) => t.index)).toEqual([1, 2])
  })

  it('flags list-item words', () => {
    const w = words('- one two\n- three')
    expect(w.every((t) => t.listItem)).toBe(true)
    expect(w.map((t) => t.text)).toEqual(['one', 'two', 'three'])
  })

  it('marks listItemStart only on the first word of each item', () => {
    const w = words('- one two\n- three four')
    // first word of item 1 ('one') and item 2 ('three') start; others don't.
    expect(w.map((t) => t.listItemStart)).toEqual([true, false, true, false])
  })

  it('never marks listItemStart on plain paragraph words', () => {
    expect(words('plain words here').some((t) => t.listItemStart)).toBe(false)
  })

  it('does not flag plain paragraph words as list items', () => {
    expect(words('just a paragraph').every((t) => !t.listItem)).toBe(true)
  })

  it('flags a soft line break (single newline) on the next line\'s first word', () => {
    // A metadata block: each "**Key:** val" line separated by single newlines
    // is one paragraph; the first word of each later line carries breakBefore.
    const w = words('**Status:** open\n**Owner:** sooraj')
    expect(w.map((t) => t.text)).toEqual(['Status:', 'open', 'Owner:', 'sooraj'])
    expect(w.map((t) => t.breakBefore)).toEqual([false, false, true, false])
  })

  it('captures emphasis marks', () => {
    const w = words('a **bold** and *italic* word')
    const bold = w.find((t) => t.text === 'bold')!
    const italic = w.find((t) => t.text === 'italic')!
    expect(bold.emphasis).toContain('strong')
    expect(italic.emphasis).toContain('em')
  })

  it('reads words inside links and blockquotes', () => {
    expect(words('see [the docs](https://x.com)').map((t) => t.text)).toEqual([
      'see',
      'the',
      'docs',
    ])
    expect(words('> quoted text here').map((t) => t.text)).toEqual([
      'quoted',
      'text',
      'here',
    ])
  })
})

describe('parseMarkdown — blocks', () => {
  it('records one block per top-level block with token ranges', () => {
    const { blocks } = parseMarkdown('# Title\n\nsome body words')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('heading')
    expect(blocks[0].tokenStart).toBe(0)
    expect(blocks[0].tokenEnd).toBe(0)
    expect(blocks[1].type).toBe('paragraph')
    expect(blocks[1].tokenStart).toBe(1)
    expect(blocks[1].tokenEnd).toBe(3)
  })

  it('every word token points back to a real block range', () => {
    const { tokens, blocks } = parseMarkdown(
      '# H\n\npara one\n\n- list item\n\n```\ncode\n```',
    )
    for (const t of tokens) {
      const b = blocks.find(
        (b) => t.index >= b.tokenStart && t.index <= b.tokenEnd,
      )
      expect(b, `token ${t.index} has a block`).toBeDefined()
      expect(t.blockId).toBe(b!.id)
    }
  })

  it('produces an empty result for empty input', () => {
    const { tokens, blocks } = parseMarkdown('')
    expect(tokens).toHaveLength(0)
    expect(blocks).toHaveLength(0)
  })
})

describe('parseMarkdown — sections', () => {
  it('splits the document into heading-delimited sections', () => {
    const md = '# One\n\nbody of one\n\n# Two\n\nbody of two here'
    const { sections } = parseMarkdown(md)
    expect(sections).toHaveLength(2)
    expect(sections.map((s) => s.title)).toEqual(['One', 'Two'])
    expect(sections.every((s) => s.hasHeading)).toBe(true)
  })

  it('groups content under its heading (token range spans heading + body)', () => {
    const { sections, tokens } = parseMarkdown('# H\n\nalpha beta gamma')
    const s = sections[0]
    // heading token + 3 words
    expect(s.tokenStart).toBe(0)
    expect(s.tokenEnd).toBe(3)
    expect(tokens[s.tokenStart].kind).toBe('atomic')
  })

  it('puts leading content before the first heading in an untitled section', () => {
    const { sections } = parseMarkdown('intro words\n\n# Heading\n\nbody')
    expect(sections).toHaveLength(2)
    expect(sections[0].hasHeading).toBe(false)
    expect(sections[0].title).toBe('')
    expect(sections[1].title).toBe('Heading')
  })

  it('treats consecutive headings as separate sections', () => {
    const { sections } = parseMarkdown('# A\n\n## B\n\ntext')
    expect(sections.map((s) => s.title)).toEqual(['A', 'B'])
  })
})
