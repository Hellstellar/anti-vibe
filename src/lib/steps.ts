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

/**
 * Build the Step-mode units for a section (sentence granularity):
 * paragraphs/quotes -> one unit per sentence, lists -> one per item,
 * tables -> one per body row, code/image -> one unit each.
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
        const label = b.type === 'blockquote' ? 'QUOTE' : 'PARAGRAPH'
        for (const s of splitSentences(words)) {
          units.push({ kind: 'sentence', label, groupId: bi, words: s })
        }
        break
      }
      case 'list': {
        const items: WordToken[][] = []
        for (const w of words) {
          if (w.listItemStart || items.length === 0) items.push([])
          items[items.length - 1].push(w)
        }
        items.forEach((it, i) =>
          units.push({
            kind: 'listItem',
            label: `LIST · ${i + 1}/${items.length}`,
            groupId: bi,
            words: it,
          }),
        )
        break
      }
      case 'table': {
        const rows = ((b.node as { children?: unknown[] }).children ?? []) as unknown[]
        const bodyCount = Math.max(0, rows.length - 1) // first row is the header
        for (let i = 1; i < rows.length; i++) {
          units.push({
            kind: 'tableRow',
            label: `TABLE · ROW ${i}/${bodyCount}`,
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
