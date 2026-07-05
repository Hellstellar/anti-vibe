// Renderer #1 of the comment layer: turn captured comments into a copy-paste
// prompt a coding agent can apply. Pure function of Comment[] — the same data
// a future marker exporter will consume.

import type { Comment } from './types'

/** Indent every line of `text` so it sits inside a markdown blockquote. */
function quoteLines(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) => `   > ${line}`)
    .join('\n')
}

/**
 * Build a feedback prompt from a document's comments. Anchored comments are
 * grouped by section and ordered by document position; each cites its anchor
 * verbatim so the agent can locate and revise in place. Unanchored notes go in
 * a trailing "General" bucket. Resolved comments are omitted.
 */
export function buildFeedbackPrompt(comments: Comment[], docTitle: string): string {
  const active = comments.filter((c) => !c.resolved)
  const anchored = active
    .filter((c) => c.anchor)
    .sort(
      (a, b) =>
        a.anchor!.sectionId - b.anchor!.sectionId ||
        a.anchor!.tokenStart - b.anchor!.tokenStart,
    )
  const general = active.filter((c) => !c.anchor)

  if (anchored.length === 0 && general.length === 0) {
    return 'No feedback to apply.'
  }

  const out: string[] = []
  out.push(`# Feedback on ${docTitle ? `"${docTitle}"` : 'the document'}`)
  out.push(
    '\nApply the review feedback below. Each item quotes the anchor text ' +
      'verbatim — locate that text and revise in place. The quotes are from ' +
      'the version I reviewed; if the text has since changed, match by meaning.',
  )

  let lastSection = -1
  let n = 0
  for (const c of anchored) {
    const a = c.anchor!
    if (a.sectionId !== lastSection) {
      out.push(`\n## § ${a.sectionTitle || '(intro)'}`)
      lastSection = a.sectionId
    }
    n++
    out.push(`\n${n}. Anchored to:\n${quoteLines(a.quote)}\n\n   ${c.body.trim()}`)
  }

  if (general.length > 0) {
    out.push('\n## General (whole document)\n')
    for (const c of general) out.push(`- ${c.body.trim()}`)
  }

  return out.join('\n')
}
