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
  title: string
  explanation: string
  oneLineSummary: string
  callsTo?: string[]
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

  // Collect every hunk across files whose path matches the stop's, source-ordered.
  const candidates: Hunk[] = []
  for (const [file, hunks] of byFile) {
    if (pathsMatch(file, stop.file)) candidates.push(...hunks)
  }
  candidates.sort((a, b) => a.newStart - b.newStart)

  const hunks: ResolvedHunk[] = candidates.map((h) => ({
    header: h.header,
    diffText: h.text,
    line: h.newStart,
  }))

  if (hunks.length === 0) return { ...base, hunks, matchStatus: 'missing' }

  // Overall status from the optional locator hint.
  const { hunkHeader, lineRange } = stop.locator ?? {}
  let matchStatus: MatchStatus = 'exact'
  if (hunkHeader) {
    const want = hunkHeader.trim()
    matchStatus = candidates.some((h) => h.header.trim() === want) ? 'exact' : 'fuzzy'
  } else if (lineRange) {
    const hit = candidates.some((h) => {
      const hEnd = h.newStart + h.newCount - 1
      return Math.min(hEnd, lineRange.end) >= Math.max(h.newStart, lineRange.start)
    })
    matchStatus = hit ? 'exact' : 'fuzzy'
  }
  // No locator → whole-file grab, treated as an intentional exact match.

  return { ...base, hunks, matchStatus }
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
