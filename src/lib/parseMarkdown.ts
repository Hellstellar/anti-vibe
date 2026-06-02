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
  Token,
  WordToken,
  AtomicToken,
} from './types'

const processor = unified().use(remarkParse).use(remarkGfm)

/** Strip everything but letters/digits for ORP + length math. */
function clean(text: string): string {
  return text.replace(/[^\p{L}\p{N}]/gu, '')
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

  const pushWord = (
    text: string,
    blockId: number,
    emphasis: Emphasis[],
    listItem: boolean,
  ) => {
    const c = clean(text)
    if (!text.trim()) return
    const token: WordToken = {
      kind: 'word',
      text,
      clean: c,
      blockId,
      emphasis: [...emphasis],
      listItem,
      index: tokens.length,
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
          for (const w of child.value.split(/\s+/)) {
            pushWord(w, blockId, emphasis, listItem)
          }
          break
        case 'inlineCode':
          for (const w of child.value.split(/\s+/)) {
            pushWord(w, blockId, emphasis, listItem)
          }
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

  const walkList = (list: List, blockId: number) => {
    for (const item of list.children) {
      for (const child of item.children) {
        if (child.type === 'paragraph') {
          walkInline(child.children, blockId, [], true)
        } else if (child.type === 'list') {
          walkList(child, blockId)
        }
      }
    }
  }

  const walkBlockquote = (bq: Blockquote, blockId: number) => {
    for (const child of bq.children) {
      if (child.type === 'paragraph') {
        walkInline(child.children, blockId, [], false)
      } else if (child.type === 'list') {
        walkList(child, blockId)
      } else if (child.type === 'blockquote') {
        walkBlockquote(child, blockId)
      }
    }
  }

  for (const node of tree.children) {
    const blockId = blocks.length
    const tokenStart = tokens.length

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
          walkInline(node.children, blockId, [], false)
        }
        break
      case 'list':
        walkList(node, blockId)
        break
      case 'blockquote':
        walkBlockquote(node, blockId)
        break
      default:
        // thematicBreak, html, definition, etc. — skip
        break
    }

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

  return { tokens, blocks }
}
