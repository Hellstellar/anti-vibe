import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import type { ResolvedFlowStop, ResolvedHunk, MatchStatus } from '../src/lib/types'

const exec = promisify(execFile)

/** Hunk locator: exactly one of `hunkHeader` / `lineRange` (validated upstream). */
export interface HunkLocator {
  hunkHeader?: string
  lineRange?: { start: number; end: number }
}

/** A review stop as sent by the agent — structure only, no diff text.
 *  `locator` is an optional hint to mark the primary hunk / set match status;
 *  a stop always resolves to ALL of its file's hunks regardless. */
export interface FlowStopInput {
  id: string
  file: string
  locator?: HunkLocator
  layer: 'flow' | 'foundation'
  /** True for a connective step that has no change — shown for flow continuity.
   *  Skips git matching entirely (no diff, no "no hunk" warning). */
  context?: boolean
  title: string
  explanation: string
  oneLineSummary: string
  /** Callee stop ids, optionally labeled with the caller-side function. */
  callsTo?: Array<string | { to: string; via?: string }>
  /** Semantic reading order for the stop's hunks: each entry locates one hunk
   *  and captions it. Hunks not listed append after, in source order. */
  hunkFlow?: Array<{ match: HunkLocator; note?: string }>
}

export interface FlowReviewInput {
  title?: string
  repoPath?: string
  diffBase?: string
  stops: FlowStopInput[]
}

interface Hunk {
  /** The full `@@ -a,b +c,d @@ ...` header line. */
  header: string
  /** First line of the new file covered by this hunk. */
  newStart: number
  /** Number of new-file lines covered. */
  newCount: number
  /** Full hunk text including the header line. */
  text: string
}

export interface ResolveResult {
  stops: ResolvedFlowStop[]
  /** Per-stop warnings (fuzzy / missing) for the ToolResult text. */
  warnings: string[]
}

/** Resolve and validate the repo dir: explicit input → env → cwd. Throws if it
 *  is not inside a git work tree. */
export async function resolveRepoPath(input?: string): Promise<string> {
  const repo = input || process.env.ANTIVIBE_REPO_DIR || process.cwd()
  try {
    await exec('git', ['-C', repo, 'rev-parse', '--is-inside-work-tree'])
  } catch {
    throw new Error(
      `"${repo}" is not a git repository. Pass repoPath, or set ANTIVIBE_REPO_DIR, to the repo under review.`,
    )
  }
  return repo
}

/** Run `git diff` and return the raw unified diff. `base` is split on whitespace
 *  so multi-token forms work: `HEAD~1 HEAD`, `--cached`, `main...HEAD`, `--staged`,
 *  a bare rev, or empty (working tree). */
export async function runGitDiff(repo: string, base?: string): Promise<string> {
  const args = ['-C', repo, 'diff', '--unified=3']
  const extra = (base ?? '').trim()
  if (extra) args.push(...extra.split(/\s+/))
  const { stdout } = await exec('git', args, { maxBuffer: 64 * 1024 * 1024 })
  return stdout
}

/** Parse a unified diff into per-file hunks, keyed by the file's path. Handles
 *  additions, modifications, deletions (`+++ /dev/null`), renames, and binary
 *  files (surfaced as a single informational hunk). */
export function parseUnifiedDiff(diff: string): Map<string, Hunk[]> {
  const byFile = new Map<string, Hunk[]>()
  // Each file section starts at a `diff --git` line; keep the header line.
  const sections = diff.split(/^(?=diff --git )/m).filter((s) => s.startsWith('diff --git'))
  for (const section of sections) {
    const file = filePathOf(section)
    if (!file) continue

    const hunks: Hunk[] = []
    const parts = section.split(/^(?=@@ )/m)
    for (const part of parts) {
      const m = part.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
      if (!m) continue
      hunks.push({
        header: part.split('\n')[0],
        newStart: Number(m[1]),
        newCount: m[2] ? Number(m[2]) : 1,
        text: part.replace(/\n$/, ''),
      })
    }

    // Binary files carry no text hunks — surface a single informational hunk so
    // the reviewer still sees the file (leading space = context line downstream).
    if (hunks.length === 0 && /^Binary files /m.test(section)) {
      hunks.push({
        header: '@@ binary @@',
        newStart: 1,
        newCount: 0,
        text: ' (binary file changed — no line diff)',
      })
    }

    if (hunks.length) byFile.set(file, hunks)
  }
  return byFile
}

/** Resolve a file section's path: prefer the new side, fall back to the old
 *  side (deletions → `+++ /dev/null`), then the `diff --git a/x b/y` header. */
function filePathOf(section: string): string {
  const plus = section.match(/^\+\+\+ b\/(.*)$/m)?.[1]?.trim()
  if (plus && plus !== '/dev/null') return plus
  const minus = section.match(/^--- a\/(.*)$/m)?.[1]?.trim()
  if (minus && minus !== '/dev/null') return minus
  const git = section.match(/^diff --git a\/(.+?) b\/(.+)$/m)
  return (git?.[2] ?? git?.[1] ?? '').trim()
}

/** Two paths refer to the same file if either is a path-suffix of the other. */
function pathsMatch(a: string, b: string): boolean {
  const na = a.replace(/^\.?\//, '')
  const nb = b.replace(/^\.?\//, '')
  return na === nb || na.endsWith('/' + nb) || nb.endsWith('/' + na)
}

/** Resolve a stop to ALL of its file's hunks (in source order) + an overall
 *  match status derived from the optional locator hint. Exported for testing;
 *  `byFile` comes from {@link parseUnifiedDiff}. */
export function matchStop(stop: FlowStopInput, byFile: Map<string, Hunk[]>): ResolvedFlowStop {
  const base: Omit<ResolvedFlowStop, 'hunks' | 'matchStatus'> = {
    id: stop.id,
    file: stop.file,
    layer: stop.layer,
    title: stop.title,
    explanation: stop.explanation,
    oneLineSummary: stop.oneLineSummary,
    callsTo: stop.callsTo,
  }

  // Context steps carry no change — skip git matching entirely.
  if (stop.context) return { ...base, hunks: [], matchStatus: 'exact', context: true }

  // Collect every hunk across files whose path matches the stop's, source-ordered.
  const candidates: Hunk[] = []
  for (const [file, hunks] of byFile) {
    if (pathsMatch(file, stop.file)) candidates.push(...hunks)
  }
  candidates.sort((a, b) => a.newStart - b.newStart)

  if (candidates.length === 0) {
    return { ...base, hunks: [], matchStatus: 'missing' }
  }

  // Select which hunks THIS stop owns. A locator narrows to its hunk(s) so the
  // same file can appear in several flow nodes each showing a different change;
  // no locator claims the whole file (all hunks, stepped one at a time).
  const { selected, matchStatus } = selectHunks(candidates, stop.locator)
  // Then order them for reading: `hunkFlow` puts hunks in semantic (execution)
  // order with per-hunk notes; without it the source order stands.
  const { ordered, degraded } = orderByFlow(selected, stop.hunkFlow)
  const hunks: ResolvedHunk[] = ordered.map(({ hunk, note }) => ({
    header: hunk.header,
    diffText: hunk.text,
    line: hunk.newStart,
    ...(note !== undefined ? { note } : {}),
  }))
  return { ...base, hunks, matchStatus: degraded && matchStatus === 'exact' ? 'fuzzy' : matchStatus }
}

/** Order `selected` by the agent's `hunkFlow`: each entry claims (at most) one
 *  remaining hunk and captions it; unclaimed hunks append in source order.
 *  `degraded` is true when an entry missed or needed a fuzzy fallback. */
function orderByFlow(
  selected: Hunk[],
  hunkFlow: FlowStopInput['hunkFlow'],
): { ordered: { hunk: Hunk; note?: string }[]; degraded: boolean } {
  if (!hunkFlow?.length) return { ordered: selected.map((hunk) => ({ hunk })), degraded: false }

  const remaining = [...selected]
  const ordered: { hunk: Hunk; note?: string }[] = []
  let degraded = false
  for (const entry of hunkFlow) {
    const { hunk, fuzzy } = takeMatch(remaining, entry.match)
    if (!hunk) {
      degraded = true // entry matched nothing — skip it, keep the rest readable
      continue
    }
    if (fuzzy) degraded = true
    ordered.push({ hunk, note: entry.note })
  }
  for (const hunk of remaining) ordered.push({ hunk })
  return { ordered, degraded }
}

/** Match one `hunkFlow` locator against the remaining hunks and remove the hit.
 *  Header: exact match, else same new-file start line (fuzzy). Line range:
 *  first remaining hunk overlapping it. */
function takeMatch(
  remaining: Hunk[],
  locator: HunkLocator,
): { hunk?: Hunk; fuzzy: boolean } {
  const take = (i: number) => remaining.splice(i, 1)[0]
  if (locator.hunkHeader) {
    const want = locator.hunkHeader.trim()
    const exact = remaining.findIndex((h) => h.header.trim() === want)
    if (exact !== -1) return { hunk: take(exact), fuzzy: false }
    const wantLine = newStartOf(want)
    const byLine = wantLine != null ? remaining.findIndex((h) => h.newStart === wantLine) : -1
    return byLine !== -1 ? { hunk: take(byLine), fuzzy: true } : { fuzzy: true }
  }
  if (locator.lineRange) {
    const { start, end } = locator.lineRange
    const hit = remaining.findIndex((h) => {
      const hEnd = h.newStart + h.newCount - 1
      return Math.min(hEnd, end) >= Math.max(h.newStart, start)
    })
    return hit !== -1 ? { hunk: take(hit), fuzzy: false } : { fuzzy: true }
  }
  return { fuzzy: true } // empty locator can never match
}

/** Parse the new-file start line from a `@@ -a,b +c,d @@` header. */
function newStartOf(header: string): number | null {
  const m = header.match(/^@@ -\d+(?:,\d+)? \+(\d+)/)
  return m ? Number(m[1]) : null
}

/** Choose the hunk subset a stop owns, given its optional locator. */
function selectHunks(
  candidates: Hunk[],
  locator: HunkLocator | undefined,
): { selected: Hunk[]; matchStatus: MatchStatus } {
  if (!locator || (!locator.hunkHeader && !locator.lineRange)) {
    return { selected: candidates, matchStatus: 'exact' } // whole file
  }
  if (locator.hunkHeader) {
    const want = locator.hunkHeader.trim()
    const exact = candidates.find((h) => h.header.trim() === want)
    if (exact) return { selected: [exact], matchStatus: 'exact' }
    // Fall back to the hunk starting at the header's +line, else the whole file.
    const wantLine = newStartOf(want)
    const byLine = wantLine != null ? candidates.find((h) => h.newStart === wantLine) : undefined
    return byLine
      ? { selected: [byLine], matchStatus: 'fuzzy' }
      : { selected: candidates, matchStatus: 'fuzzy' }
  }
  // lineRange: every hunk overlapping the requested new-file range.
  const { start, end } = locator.lineRange!
  const overlaps = candidates.filter((h) => {
    const hEnd = h.newStart + h.newCount - 1
    return Math.min(hEnd, end) >= Math.max(h.newStart, start)
  })
  return overlaps.length
    ? { selected: overlaps, matchStatus: 'exact' }
    : { selected: candidates, matchStatus: 'fuzzy' }
}

/** Resolve a full flow-review input against the repo's git diff. Never throws on
 *  a per-stop miss — missing hunks degrade to empty diff + a warning. */
export async function resolveFlowReview(input: FlowReviewInput): Promise<ResolveResult> {
  const repo = await resolveRepoPath(input.repoPath)
  const diff = await runGitDiff(repo, input.diffBase)
  const byFile = parseUnifiedDiff(diff)

  const stops = input.stops.map((s) => {
    const resolved = matchStop(s, byFile)
    // Absolute path for "open in editor" — resolve the stop's file against the repo.
    resolved.absPath = path.resolve(repo, s.file)
    return resolved
  })
  const warnings: string[] = []
  for (const s of stops) {
    if (s.matchStatus === 'missing') warnings.push(`${s.file}: no matching hunk in diff`)
    else if (s.matchStatus === 'fuzzy') warnings.push(`${s.file}: fuzzy hunk match`)
  }
  return { stops, warnings }
}
