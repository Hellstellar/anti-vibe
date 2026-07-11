import { describe, it, expect } from 'vitest'
import { buildMarkdownDiff, isMarkdownFile } from './markdownDiff'

describe('buildMarkdownDiff', () => {
  it('drops the @@ header and strips the diff column', () => {
    const chunks = buildMarkdownDiff('@@ -1,2 +1,2 @@\n context line\n+added line')
    expect(chunks).toEqual([
      { kind: 'ctx', markdown: 'context line' },
      { kind: 'add', markdown: 'added line' },
    ])
  })

  it('merges consecutive same-kind lines into one chunk', () => {
    const chunks = buildMarkdownDiff('+## Heading\n+\n+A new paragraph.')
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ kind: 'add', markdown: '## Heading\n\nA new paragraph.' })
  })

  it('orders a modified region as del then add (before → after)', () => {
    const chunks = buildMarkdownDiff(' before\n-old line\n+new line\n after')
    expect(chunks.map((c) => c.kind)).toEqual(['ctx', 'del', 'add', 'ctx'])
    expect(chunks[1].markdown).toBe('old line')
    expect(chunks[2].markdown).toBe('new line')
  })

  it('ignores the "no newline at end of file" marker', () => {
    const chunks = buildMarkdownDiff('+last line\n\\ No newline at end of file')
    expect(chunks).toEqual([{ kind: 'add', markdown: 'last line' }])
  })

  it('treats a bare empty line as blank context', () => {
    const chunks = buildMarkdownDiff(' one\n\n two')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].kind).toBe('ctx')
    expect(chunks[0].markdown).toBe('one\n\ntwo')
  })
})

describe('isMarkdownFile', () => {
  it('matches markdown extensions case-insensitively', () => {
    expect(isMarkdownFile('docs/README.md')).toBe(true)
    expect(isMarkdownFile('NOTES.Markdown')).toBe(true)
    expect(isMarkdownFile('a/b/c.mdx')).toBe(true)
  })
  it('rejects non-markdown files', () => {
    expect(isMarkdownFile('src/index.ts')).toBe(false)
    expect(isMarkdownFile('style.css')).toBe(false)
    expect(isMarkdownFile('readme.md.ts')).toBe(false)
  })
})
