import { describe, it, expect } from 'vitest'
import { buildFeedbackPrompt } from './feedbackPrompt'
import type { Comment, CommentAnchor } from './types'

function anchor(over: Partial<CommentAnchor>): CommentAnchor {
  return {
    blockId: 0,
    sectionId: 0,
    sectionTitle: 'Intro',
    tokenStart: 0,
    tokenEnd: 0,
    quote: 'some text',
    prefix: '',
    suffix: '',
    ...over,
  }
}

function comment(over: Partial<Comment>): Comment {
  return {
    id: 'c1',
    anchor: anchor({}),
    scope: 'block',
    body: 'fix it',
    createdAt: 0,
    resolved: false,
    ...over,
  }
}

describe('buildFeedbackPrompt', () => {
  it('returns a no-op message when there is nothing active', () => {
    expect(buildFeedbackPrompt([], 'Doc')).toBe('No feedback to apply.')
    const resolved = [comment({ resolved: true })]
    expect(buildFeedbackPrompt(resolved, 'Doc')).toBe('No feedback to apply.')
  })

  it('includes the doc title in the heading', () => {
    const out = buildFeedbackPrompt([comment({})], 'My Plan')
    expect(out).toContain('# Feedback on "My Plan"')
  })

  it('groups by section and numbers anchored items in document order', () => {
    const comments: Comment[] = [
      comment({
        id: 'a',
        body: 'second section note',
        anchor: anchor({ sectionId: 1, sectionTitle: 'Rollout', tokenStart: 50, quote: 'ship it' }),
      }),
      comment({
        id: 'b',
        body: 'first section note',
        anchor: anchor({ sectionId: 0, sectionTitle: 'Intro', tokenStart: 5, quote: 'hello' }),
      }),
    ]
    const out = buildFeedbackPrompt(comments, 'Doc')
    // Intro section header precedes Rollout (sorted by sectionId).
    expect(out.indexOf('## § Intro')).toBeLessThan(out.indexOf('## § Rollout'))
    expect(out).toContain('> hello')
    expect(out).toContain('> ship it')
    expect(out).toContain('first section note')
  })

  it('puts unanchored comments in a General bucket', () => {
    const comments = [comment({ anchor: null, scope: 'document', body: 'tighten the intro' })]
    const out = buildFeedbackPrompt(comments, 'Doc')
    expect(out).toContain('## General (whole document)')
    expect(out).toContain('- tighten the intro')
  })

  it('omits resolved comments', () => {
    const comments = [
      comment({ id: 'keep', body: 'keep me' }),
      comment({ id: 'drop', body: 'drop me', resolved: true }),
    ]
    const out = buildFeedbackPrompt(comments, 'Doc')
    expect(out).toContain('keep me')
    expect(out).not.toContain('drop me')
  })
})
