// Intra-line (word-level) diff for the Flow Review diff view. Given the raw
// unified-diff lines of a hunk, it pairs each run of removed lines with the
// following run of added lines and marks only the tokens that actually changed
// — so a one-character edit highlights one word, not the whole line (the IDE
// mental model). Pure + tested in the node env, like the other lib/ modules.

/** A contiguous stretch of a rendered diff line, flagged changed or unchanged. */
export interface DiffSeg {
  text: string
  changed: boolean
}

export interface DiffRow {
  kind: 'add' | 'del' | 'ctx' | 'hunk'
  segs: DiffSeg[]
}

/** Split into word runs, whitespace runs, and punctuation runs — the unit of
 *  the intra-line diff (matches how GitHub highlights sub-line changes). */
function tokenize(s: string): string[] {
  return s.match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]+/g) ?? []
}

/** LCS over two token arrays; returns, per side, which tokens are NOT part of
 *  the common subsequence (i.e. changed). */
function lcsChanged(a: string[], b: string[]): { aChanged: boolean[]; bChanged: boolean[] } {
  const n = a.length
  const m = b.length
  // dp[i][j] = LCS length of a[i:] and b[j:].
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const aChanged = new Array(n).fill(true)
  const bChanged = new Array(m).fill(true)
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      aChanged[i] = false
      bChanged[j] = false
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++
    } else {
      j++
    }
  }
  return { aChanged, bChanged }
}

/** Collapse a per-token changed[] into merged segments (runs of same flag). */
function toSegs(tokens: string[], changed: boolean[]): DiffSeg[] {
  const segs: DiffSeg[] = []
  for (let k = 0; k < tokens.length; k++) {
    const last = segs[segs.length - 1]
    if (last && last.changed === changed[k]) last.text += tokens[k]
    else segs.push({ text: tokens[k], changed: changed[k] })
  }
  return segs
}

/** A row whose whole body is a single unchanged segment (row-tint only). */
function plainRow(kind: DiffRow['kind'], body: string): DiffRow {
  return { kind, segs: [{ text: body, changed: false }] }
}

/**
 * Turn raw unified-diff lines (each still carrying its leading `+`/`-`/space
 * marker) into rows with sub-line change segments. Removed lines are paired
 * index-wise with the following added lines; extras on either side get no
 * intra-line highlight (row tint only), matching how editors treat pure
 * insertions/deletions.
 */
export function diffRows(lines: string[]): DiffRow[] {
  const rows: DiffRow[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const marker = line[0]

    if (line.startsWith('@@')) {
      rows.push(plainRow('hunk', line))
      i++
      continue
    }

    if (marker === '-') {
      const dels: string[] = []
      while (i < lines.length && lines[i][0] === '-') dels.push(lines[i++].slice(1))
      const adds: string[] = []
      while (i < lines.length && lines[i][0] === '+') adds.push(lines[i++].slice(1))
      // Emit dels then adds (unified order), pairing by index for the token diff.
      dels.forEach((d, k) => {
        const a = adds[k]
        if (a === undefined) {
          rows.push(plainRow('del', d))
          return
        }
        const dt = tokenize(d)
        const { aChanged } = lcsChanged(dt, tokenize(a))
        rows.push({ kind: 'del', segs: toSegs(dt, aChanged) })
      })
      adds.forEach((a, k) => {
        const d = dels[k]
        if (d === undefined) {
          rows.push(plainRow('add', a))
          return
        }
        const at = tokenize(a)
        const { bChanged } = lcsChanged(tokenize(d), at)
        rows.push({ kind: 'add', segs: toSegs(at, bChanged) })
      })
      continue
    }

    if (marker === '+') {
      // A `+` run with no preceding `-` run: pure insertion, row tint only.
      rows.push(plainRow('add', line.slice(1)))
      i++
      continue
    }

    rows.push(plainRow('ctx', line.slice(1)))
    i++
  }
  return rows
}
