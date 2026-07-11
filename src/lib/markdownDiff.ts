// Rendered markdown diff for the Flow Review view. A code diff can only be read
// as source, but a *markdown* diff is prose — so for a `.md` file we render each
// side of the hunk instead of showing raw `+`/`-` lines. This module is the pure
// half: it turns a unified-diff hunk into a sequence of same-kind chunks, each a
// snippet of markdown to render. The component parses + renders each chunk.
//
// Granularity is chunk-level (a contiguous run of context / added / removed
// lines), not word-level: a modified paragraph shows as the old paragraph
// (removed) followed by the new one (added), a clear before/after. This keeps
// each chunk a self-contained markdown parse — robust for lists/tables/code —
// at the cost of splitting a mid-paragraph edit into separate blocks. The raw
// unified diff stays one toggle away for exact-source cases.

export type MdDiffKind = 'ctx' | 'add' | 'del'

/** One contiguous run of the hunk, tagged by side, holding its markdown source. */
export interface MdDiffChunk {
  kind: MdDiffKind
  /** The chunk's lines (markers stripped), joined — parsed as markdown to render. */
  markdown: string
}

/**
 * Group a hunk's unified-diff text into contiguous same-kind chunks. Drops the
 * `@@` header and any `\ No newline at end of file` marker, strips each line's
 * leading `+`/`-`/space column, and merges consecutive lines of one kind so a
 * chunk parses as a coherent markdown fragment. Unified diffs emit a modified
 * region as its removed lines then its added lines, so a `del` chunk naturally
 * precedes the matching `add` chunk (before → after).
 */
export function buildMarkdownDiff(diffText: string): MdDiffChunk[] {
  const lines = diffText.replace(/\n+$/, '').split('\n')
  const chunks: MdDiffChunk[] = []
  for (const raw of lines) {
    if (raw.startsWith('@@') || raw.startsWith('\\')) continue
    const marker = raw[0]
    const kind: MdDiffKind = marker === '+' ? 'add' : marker === '-' ? 'del' : 'ctx'
    const body = raw.length > 0 ? raw.slice(1) : '' // drop the +/-/space diff column
    const last = chunks[chunks.length - 1]
    if (last && last.kind === kind) last.markdown += `\n${body}`
    else chunks.push({ kind, markdown: body })
  }
  return chunks
}

/** Whether a stop's file should render as markdown (drives md-diff vs raw diff). */
export function isMarkdownFile(file: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(file)
}
