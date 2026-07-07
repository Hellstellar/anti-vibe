import { describe, expect, it } from 'vitest'
import { diffRows } from './intralineDiff'

/** Concatenate only the changed-segment text of a row (what gets highlighted). */
const changedText = (segs: { text: string; changed: boolean }[]) =>
  segs
    .filter((s) => s.changed)
    .map((s) => s.text)
    .join('')

describe('diffRows', () => {
  it('highlights only the changed token in a paired del/add', () => {
    const rows = diffRows(["-  stage_step: 'user.suggest',", "+  stage_step: 'user suggest',"])
    const del = rows.find((r) => r.kind === 'del')!
    const add = rows.find((r) => r.kind === 'add')!
    expect(changedText(del.segs)).toBe('.')
    expect(changedText(add.segs)).toBe(' ')
    // The unchanged remainder is left un-highlighted.
    expect(del.segs.some((s) => !s.changed && s.text.includes('stage_step'))).toBe(true)
  })

  it('emits removed lines before added lines (unified order)', () => {
    const rows = diffRows(['-old', '+new'])
    expect(rows.map((r) => r.kind)).toEqual(['del', 'add'])
  })

  it('marks context lines fully unchanged', () => {
    const rows = diffRows([' unchanged line'])
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('ctx')
    expect(changedText(rows[0].segs)).toBe('')
    expect(rows[0].segs[0].text).toBe('unchanged line')
  })

  it('leaves pure insertions/deletions as row-tint only (no word highlight)', () => {
    const rows = diffRows(['-gone', '+added one', '+added two'])
    // One del paired with the first add; the second add is unpaired.
    const adds = rows.filter((r) => r.kind === 'add')
    const unpaired = adds[1]
    expect(unpaired.segs).toHaveLength(1)
    expect(unpaired.segs[0].changed).toBe(false)
  })

  it('drops hunk headers into their own row', () => {
    const rows = diffRows(['@@ -1,2 +1,2 @@', ' ctx'])
    expect(rows[0].kind).toBe('hunk')
  })

  it('reconstructs each line body from its segments', () => {
    const rows = diffRows(["-  const x = foo(bar);", "+  const x = foo(baz);"])
    const del = rows.find((r) => r.kind === 'del')!
    expect(del.segs.map((s) => s.text).join('')).toBe('  const x = foo(bar);')
  })
})
