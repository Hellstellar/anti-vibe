import { describe, it, expect } from 'vitest'
import {
  paginateCode,
  CODE_PAGE_MAX_LINES,
  CODE_PAGE_MIN_LINES,
  type CodePage,
} from './codePages'

/** Every page respects the cap, is non-empty, and pages advance in order. */
function expectWellFormed(pages: CodePage[]) {
  for (const p of pages) {
    expect(p.end).toBeGreaterThanOrEqual(p.start)
    expect(p.end - p.start + 1).toBeLessThanOrEqual(CODE_PAGE_MAX_LINES)
  }
  for (let i = 1; i < pages.length; i++) {
    expect(pages[i].start).toBeGreaterThan(pages[i - 1].end)
  }
}

/** N-line function body: "function fN() {", N-2 indented lines, "}". */
function fn(name: string, bodyLines: number): string {
  const body = Array.from({ length: bodyLines }, (_, i) => `  const v${i} = ${i}`)
  return [`function ${name}() {`, ...body, '}'].join('\n')
}

describe('paginateCode', () => {
  it('keeps a block that fits as a single whole page', () => {
    const code = fn('small', 5)
    expect(paginateCode(code, 'js')).toEqual([{ start: 0, end: 6 }])
  })

  it('breaks at blank lines between functions', () => {
    // Three 12-line functions separated by blanks: 38 lines total.
    const code = [fn('a', 10), '', fn('b', 10), '', fn('c', 10)].join('\n')
    const lines = code.split('\n')
    const pages = paginateCode(code, 'js')
    expectWellFormed(pages)
    expect(pages.length).toBeGreaterThan(1)
    // Every page boundary lands after a complete function: the line following
    // each page (minus skipped blanks) starts a new top-level declaration.
    for (const p of pages) {
      expect(lines[p.end].startsWith('  ')).toBe(false)
    }
  })

  it('never ends a page on an open construct when a better break exists', () => {
    const code = [fn('a', 10), '', fn('b', 30)].join('\n')
    const lines = code.split('\n')
    const pages = paginateCode(code, 'js')
    expectWellFormed(pages)
    for (const p of pages.slice(0, -1)) {
      expect(/[{([,]\s*$/.test(lines[p.end])).toBe(false)
    }
  })

  it('hard-cuts dense code with no natural boundary, leaving no sliver tail', () => {
    const code = Array.from({ length: 45 }, (_, i) => `  x${i} += ${i}`).join('\n')
    const pages = paginateCode(code, 'js')
    expectWellFormed(pages)
    const last = pages[pages.length - 1]
    expect(last.end - last.start + 1).toBeGreaterThanOrEqual(CODE_PAGE_MIN_LINES)
    expect(last.end).toBe(44) // full coverage — nothing dropped
  })

  it('aligns page starts to @@ hunk headers in diffs', () => {
    const hunk = (at: number) =>
      [`@@ -${at},8 +${at},8 @@`, ...Array.from({ length: 8 }, (_, i) => `+  line ${at + i}`)].join(
        '\n',
      )
    const code = [hunk(1), hunk(20), hunk(40), hunk(60)].join('\n')
    const lines = code.split('\n')
    const pages = paginateCode(code, 'diff')
    expectWellFormed(pages)
    // Every page after the first opens on a hunk header.
    for (const p of pages.slice(1)) {
      expect(lines[p.start].startsWith('@@')).toBe(true)
    }
  })

  it('treats diff-prefixed blank lines as blank boundaries', () => {
    const block = (tag: string) =>
      Array.from({ length: 12 }, (_, i) => `+const ${tag}${i} = ${i}`).join('\n')
    const code = [block('a'), '+', block('b'), '+', block('c')].join('\n')
    const pages = paginateCode(code, 'diff')
    expectWellFormed(pages)
    const lines = code.split('\n')
    // Boundary blanks are trimmed from page ends and skipped at page starts.
    for (const p of pages) {
      expect(lines[p.start]).not.toBe('+')
      expect(lines[p.end]).not.toBe('+')
    }
  })

  it('drops trailing blank lines from a page instead of rendering dead space', () => {
    const code = [fn('a', 10), '', '', '', fn('b', 20)].join('\n')
    const lines = code.split('\n')
    const pages = paginateCode(code, 'js')
    expectWellFormed(pages)
    expect(lines[pages[0].end].trim()).not.toBe('')
    expect(lines[pages[1].start].trim()).not.toBe('')
  })
})
