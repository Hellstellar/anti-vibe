import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type {
  Root,
  RootContent,
  PhrasingContent,
  Paragraph,
  List,
  Blockquote,
} from 'mdast'
import type {
  Block,
  Emphasis,
  ParseResult,
  Section,
  Token,
  WordToken,
  AtomicToken,
} from './types'

const processor = unified().use(remarkParse).use(remarkGfm)

/** Strip everything but letters/digits for ORP + length math. */
function clean(text: string): string {
  return text.replace(/[^\p{L}\p{N}]/gu, '')
}

/** Flatten an mdast node to its plain text (for heading titles). */
function nodeText(node: any): string {
  if (!node) return ''
  if (typeof node.value === 'string') return node.value
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('')
  return ''
}

/** Group blocks into heading-delimited sections. */
function buildSections(blocks: Block[]): Section[] {
  const sections: Section[] = []
  blocks.forEach((b, bi) => {
    const isHeading = b.type === 'heading'
    if (isHeading || sections.length === 0) {
      sections.push({
        id: sections.length,
        title: isHeading ? nodeText(b.node) : '',
        hasHeading: isHeading,
        blockStart: bi,
        blockEnd: bi,
        tokenStart: b.tokenStart,
        tokenEnd: b.tokenEnd,
      })
    } else {
      const s = sections[sections.length - 1]
      s.blockEnd = bi
      s.tokenEnd = b.tokenEnd
    }
  })
  return sections
}

/** Is this paragraph nothing but image(s) (+ whitespace)? */
function isImageOnly(node: Paragraph): boolean {
  const meaningful = node.children.filter(
    (c) => !(c.type === 'text' && c.value.trim() === ''),
  )
  return meaningful.length > 0 && meaningful.every((c) => c.type === 'image')
}

export function parseMarkdown(src: string): ParseResult {
  const tree = processor.parse(src) as Root
  const tokens: Token[] = []
  const blocks: Block[] = []
  let wordCount = 0
  // Set when a new list item begins; the next emitted word claims it so the
  // bullet animates once per item rather than on every word.
  let pendingListStart = false
  // Set on a line break (soft or hard); the next word records it so the
  // reading view can render the break.
  let pendingBreak = false

  const pushWord = (
    text: string,
    blockId: number,
    emphasis: Emphasis[],
    listItem: boolean,
  ) => {
    if (!text.trim()) {
      return
    }
    const listItemStart = listItem && pendingListStart
    if (listItemStart) pendingListStart = false
    const breakBefore = pendingBreak
    pendingBreak = false
    const token: WordToken = {
      kind: 'word',
      text,
      clean: clean(text),
      blockId,
      emphasis: [...emphasis],
      listItem,
      listItemStart,
      breakBefore,
      index: tokens.length,
      wordIndex: wordCount++,
    }
    tokens.push(token)
  }

  const pushAtomic = (
    blockType: AtomicToken['blockType'],
    node: RootContent,
    blockId: number,
  ) => {
    tokens.push({
      kind: 'atomic',
      blockType,
      node,
      blockId,
      index: tokens.length,
    })
  }

  /** Walk inline (phrasing) content, emitting word tokens. */
  const walkInline = (
    children: PhrasingContent[],
    blockId: number,
    emphasis: Emphasis[],
    listItem: boolean,
  ) => {
    for (const child of children) {
      switch (child.type) {
        case 'text':
        case 'inlineCode': {
          // Preserve soft line breaks (single \n) inside the text: the first
          // word of each line after the first is flagged with a break.
          const lines = child.value.split('\n')
          lines.forEach((line, li) => {
            if (li > 0) pendingBreak = true
            for (const w of line.split(/\s+/)) {
              pushWord(w, blockId, emphasis, listItem)
            }
          })
          break
        }
        case 'break':
          // Hard line break (trailing spaces or backslash).
          pendingBreak = true
          break
        case 'emphasis':
          walkInline(child.children, blockId, [...emphasis, 'em'], listItem)
          break
        case 'strong':
          walkInline(child.children, blockId, [...emphasis, 'strong'], listItem)
          break
        case 'delete':
        case 'link':
        case 'linkReference':
          walkInline(
            child.children as PhrasingContent[],
            blockId,
            emphasis,
            listItem,
          )
          break
        case 'image':
          if (child.alt) pushWord(child.alt, blockId, emphasis, listItem)
          break
        default:
          // break, html, footnoteRef, etc. — skip for MVP
          break
      }
    }
  }

  /**
   * Emit tokens for a single block-level node. Used both for top-level blocks
   * and for blocks nested inside list items / blockquotes, so nested code,
   * tables, headings and images are not silently dropped.
   */
  const emitNode = (node: RootContent, blockId: number, listItem: boolean) => {
    pendingBreak = false // breaks don't carry across blocks
    switch (node.type) {
      case 'heading':
        pushAtomic('heading', node, blockId)
        break
      case 'code':
        pushAtomic('code', node, blockId)
        break
      case 'table':
        pushAtomic('table', node, blockId)
        break
      case 'paragraph':
        if (isImageOnly(node)) {
          pushAtomic('image', node, blockId)
        } else {
          walkInline(node.children, blockId, [], listItem)
        }
        break
      case 'list':
        for (const item of (node as List).children) {
          pendingListStart = true
          for (const child of item.children) {
            emitNode(child, blockId, true)
          }
        }
        break
      case 'blockquote':
        for (const child of (node as Blockquote).children) {
          emitNode(child, blockId, listItem)
        }
        break
      default:
        // thematicBreak, html, definition, etc. — skip
        break
    }
  }

  for (const node of tree.children) {
    const blockId = blocks.length
    const tokenStart = tokens.length

    emitNode(node, blockId, false)

    const tokenEnd = tokens.length - 1
    if (tokenEnd >= tokenStart) {
      blocks.push({
        id: blockId,
        type: node.type,
        node,
        tokenStart,
        tokenEnd,
      })
    }
  }

  return { tokens, blocks, sections: buildSections(blocks) }
}
