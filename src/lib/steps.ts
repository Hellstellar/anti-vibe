import type { Block, Section, StepUnit, Token, WordToken } from './types'

/** Group words into sentences, breaking after .!? (with trailing quotes/brackets). */
export function splitSentences(words: WordToken[]): WordToken[][] {
  const out: WordToken[][] = []
  let cur: WordToken[] = []
  for (const w of words) {
    cur.push(w)
    if (/[.!?][)"'\]]*$/.test(w.text)) {
      out.push(cur)
      cur = []
    }
  }
  if (cur.length) out.push(cur)
  return out
}

/** Hierarchy breadcrumb label for a word, e.g. "LIST › LIST". */
const crumbLabel = (w: WordToken) =>
  (w.crumbs.length ? w.crumbs : ['PARAGRAPH']).join(' › ')

/**
 * Build the Step-mode units for a section (sentence granularity):
 * paragraphs/quotes -> one unit per sentence, lists -> one per item (split
 * further on nesting/sub-paragraph changes), tables -> one per body row,
 * code/image -> one unit each. Labels show the containment breadcrumb.
 */
export function buildSteps(
  tokens: Token[],
  blocks: Block[],
  section: Section,
): StepUnit[] {
  const units: StepUnit[] = []
  const start = section.blockStart + (section.hasHeading ? 1 : 0)

  for (let bi = start; bi <= section.blockEnd; bi++) {
    const b = blocks[bi]
    if (!b) continue
    const slice = tokens.slice(b.tokenStart, b.tokenEnd + 1)
    const words = slice.filter((t): t is WordToken => t.kind === 'word')

    switch (b.type) {
      case 'paragraph':
      case 'blockquote': {
        if (words.length === 0) {
          // image-only paragraph -> atomic image
          units.push({ kind: 'image', label: 'IMAGE', groupId: bi, node: b.node })
          break
        }
        for (const s of splitSentences(words)) {
          units.push({
            kind: 'sentence',
            label: crumbLabel(s[0]),
            groupId: bi,
            words: s,
          })
        }
        break
      }
      case 'list': {
        // A list block is flattened (nested lists + sub-paragraphs share it).
        // Split into units whenever a list item starts OR the breadcrumb
        // changes (nesting depth or a sub-paragraph), so each unit's label
        // reflects its place in the hierarchy.
        const items: WordToken[][] = []
        let prevKey = ''
        for (const w of words) {
          const key = w.crumbs.join('>')
          if (w.listItemStart || key !== prevKey || items.length === 0) {
            items.push([])
          }
          prevKey = key
          items[items.length - 1].push(w)
        }
        items.forEach((it) => {
          // a sub-paragraph inside a list reads as prose (no bullet)
          const leaf = it[0].crumbs[it[0].crumbs.length - 1]
          units.push({
            kind: leaf === 'PARAGRAPH' ? 'sentence' : 'listItem',
            label: crumbLabel(it[0]),
            groupId: bi,
            words: it,
          })
        })
        break
      }
      case 'table': {
        const rows = ((b.node as { children?: unknown[] }).children ?? []) as unknown[]
        for (let i = 1; i < rows.length; i++) {
          units.push({
            kind: 'tableRow',
            label: 'TABLE ROW',
            groupId: bi,
            node: b.node,
            rowIndex: i,
          })
        }
        break
      }
      case 'code':
        units.push({ kind: 'code', label: 'CODE', groupId: bi, node: b.node })
        break
      default:
        // standalone image atomic, etc.
        units.push({ kind: 'image', label: 'IMAGE', groupId: bi, node: b.node })
        break
    }
  }
  return units
}
