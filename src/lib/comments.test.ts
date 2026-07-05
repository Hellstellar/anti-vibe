import { describe, it, expect } from 'vitest'
import { parseMarkdown } from './parseMarkdown'
import { buildAnchor, docKeyFor, resolveAnchor } from './comments'
import type { CommentScope } from './types'

/** Build an anchor for the whole of block `blockId` at the given scope. */
function anchorBlock(src: string, blockId: number, scope: Exclude<CommentScope, 'document'>) {
  const { tokens, blocks, sections } = parseMarkdown(src)
  const block = blocks[blockId]
  return buildAnchor({
    src,
    tokens,
    blocks,
    sections,
    tokenStart: block.tokenStart,
    tokenEnd: block.tokenEnd,
    scope,
  })
}

describe('docKeyFor', () => {
  it('prefers the documentId when present', () => {
    expect(docKeyFor('whatever', 'doc-123')).toBe('doc-123')
  })

  it('hashes the source when no documentId', () => {
    const k = docKeyFor('# Hello')
    expect(k).toMatch(/^h_/)
  })

  it('is stable for identical source and differs for different source', () => {
    expect(docKeyFor('# A')).toBe(docKeyFor('# A'))
    expect(docKeyFor('# A')).not.toBe(docKeyFor('# B'))
  })
})

describe('buildAnchor', () => {
  const src = '# Title\n\nThe first paragraph here.\n\n## Section Two\n\nSecond body text.'

  it('block scope quotes the exact block source and finds its section', () => {
    // blocks: 0=heading Title, 1=para, 2=heading Section Two, 3=para
    const a = anchorBlock(src, 1, 'block')
    expect(a.quote).toBe('The first paragraph here.')
    expect(a.blockId).toBe(1)
    expect(a.sectionTitle).toBe('Title')
  })

  it('attributes a block to the heading-delimited section it falls under', () => {
    const a = anchorBlock(src, 3, 'block')
    expect(a.quote).toBe('Second body text.')
    expect(a.sectionTitle).toBe('Section Two')
  })

  it('captures prefix/suffix context for block scope', () => {
    const a = anchorBlock(src, 1, 'block')
    expect(src.indexOf(a.prefix + a.quote + a.suffix)).toBeGreaterThanOrEqual(0)
  })

  it('section scope spans from the heading through its body', () => {
    const a = anchorBlock(src, 2, 'section')
    expect(a.quote).toContain('Section Two')
    expect(a.quote).toContain('Second body text.')
  })

  it('span scope joins word text and omits context', () => {
    const { tokens, blocks, sections } = parseMarkdown(src)
    const block = blocks[1]
    const a = buildAnchor({
      src,
      tokens,
      blocks,
      sections,
      tokenStart: block.tokenStart,
      tokenEnd: block.tokenStart + 1, // first two words
      scope: 'span',
    })
    expect(a.quote).toBe('The first')
    expect(a.prefix).toBe('')
    expect(a.suffix).toBe('')
  })
})

describe('resolveAnchor', () => {
  const src = '# Title\n\nThe first paragraph here.\n\n## Section Two\n\nSecond body text.'

  it('re-locates an unchanged anchor via prefix+quote+suffix', () => {
    const a = anchorBlock(src, 1, 'block')
    const r = resolveAnchor(src, a)
    expect(r).not.toBeNull()
    expect(src.slice(r!.from, r!.to)).toBe('The first paragraph here.')
  })

  it('re-locates by bare quote when context no longer matches', () => {
    const a = anchorBlock(src, 1, 'block')
    // Edit the surrounding text so prefix/suffix break but the quote survives.
    const edited = 'Totally different intro.\n\nThe first paragraph here.\n\nMore.'
    const r = resolveAnchor(edited, a)
    expect(r).not.toBeNull()
    expect(edited.slice(r!.from, r!.to)).toBe('The first paragraph here.')
  })

  it('returns null for an orphaned anchor whose text is gone', () => {
    const a = anchorBlock(src, 1, 'block')
    expect(resolveAnchor('completely unrelated content', a)).toBeNull()
  })
})
