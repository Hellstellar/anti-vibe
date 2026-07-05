/** A contiguous, inclusive line range of a code block shown as one Step unit. */
export interface CodePage {
  start: number
  end: number
}

/** Max lines per page — sized so a page fits .step-code (56vh) without scrolling. */
export const CODE_PAGE_MAX_LINES = 20
/** Min lines per page — no orphan slivers; also the guaranteed remainder after a cut. */
export const CODE_PAGE_MIN_LINES = 5

/** Languages whose lines carry a one-char diff prefix (+/-/space). */
const DIFF_LANGS = ['diff', 'patch']

/** Content of a line with any diff prefix removed, for blankness/indent checks. */
function stripDiffPrefix(line: string, isDiff: boolean): string {
  return isDiff && /^[+\- ]/.test(line) ? line.slice(1) : line
}

function isBlank(line: string, isDiff: boolean): boolean {
  return stripDiffPrefix(line, isDiff).trim() === ''
}

/** A line no page may end on: it opens a construct the next line continues. */
const OPEN_ENDED = /([{([,:]|=>|&&|\|\|)\s*$/
/** A line that only closes constructs, e.g. "}", "});", "  ]". */
const CLOSING_ONLY = /^\s*[)\]}]+[,;]?\s*$/

/**
 * Score breaking a page AFTER line `e`. Higher is better; 0 means "only if
 * nothing better in the window"; -1 means never (mid-construct).
 */
function breakScore(lines: string[], e: number, isDiff: boolean): number {
  const cur = stripDiffPrefix(lines[e], isDiff)
  const rawNext = lines[e + 1] ?? ''
  const next = stripDiffPrefix(rawNext, isDiff)

  // A diff hunk header starts a new semantic unit — the ideal page start.
  if (isDiff && rawNext.startsWith('@@')) return 10
  if (cur.trim() === '') return 6
  if (OPEN_ENDED.test(cur.trimEnd())) return -1
  // Next line starts a new top-level construct (column 0, not a bare closer).
  if (next.trim() !== '' && !/^\s/.test(next) && !CLOSING_ONLY.test(next)) return 4
  if (CLOSING_ONLY.test(cur)) return 3
  return 0
}

/** Page [s, e] with trailing blank lines dropped (they'd render as dead space). */
function trimmedPage(lines: string[], s: number, e: number, isDiff: boolean): CodePage {
  let end = e
  while (end > s && isBlank(lines[end], isDiff)) end--
  return { start: s, end }
}

/**
 * Split a code block's text into display pages for Step mode. Pages end at the
 * best-scoring boundary inside an elastic window (blank line, top-level decl,
 * diff hunk header), never mid-construct when avoidable, and are hard-capped
 * at CODE_PAGE_MAX_LINES. A block that already fits is a single page.
 */
export function paginateCode(value: string, lang?: string | null): CodePage[] {
  const lines = value.split('\n')
  const isDiff = lang != null && DIFF_LANGS.includes(lang)
  const n = lines.length
  if (n <= CODE_PAGE_MAX_LINES) return [{ start: 0, end: n - 1 }]

  const pages: CodePage[] = []
  let s = 0
  while (n - s > CODE_PAGE_MAX_LINES) {
    const lower = s + CODE_PAGE_MIN_LINES - 1
    // Also leave at least a min-size remainder so the tail is never a sliver.
    const upper = Math.min(s + CODE_PAGE_MAX_LINES - 1, n - 1 - CODE_PAGE_MIN_LINES)
    let cut = upper
    let best = 0
    for (let e = lower; e <= upper; e++) {
      const score = breakScore(lines, e, isDiff)
      if (score > 0 && score >= best) {
        best = score
        cut = e // ties -> latest candidate, so pages lean full
      }
    }
    pages.push(trimmedPage(lines, s, cut, isDiff))
    s = cut + 1
    while (s < n && isBlank(lines[s], isDiff)) s++ // pages never open on a blank
  }
  if (s < n) pages.push(trimmedPage(lines, s, n - 1, isDiff))
  return pages
}
