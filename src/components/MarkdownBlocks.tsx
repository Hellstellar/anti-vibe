import { useMemo } from 'react'
import { parseMarkdown } from '../lib/parseMarkdown'
import { isMermaid } from '../lib/mermaid'
import type { Block, Token, WordToken } from '../lib/types'
import MermaidDiagram from './MermaidDiagram'
import './MarkdownBlocks.css'

/**
 * Static, read-only markdown renderer used outside the main reader — the Flow
 * Review's rendered markdown diff and the stop's prose explanation. Unlike
 * SectionView's renderer it carries no reader-store state (no active word,
 * comments, or click handling) and it renders EVERY block type including
 * headings, so a markdown *fragment* (a diff hunk) shows fully instead of
 * silently dropping headings/code/tables. Pure function of its `markdown` prop.
 */

/** Flatten an mdast node to plain text (headings, table cells). */
function nodeText(node: unknown): string {
  const n = node as { value?: unknown; children?: unknown[] }
  if (!n) return ''
  if (typeof n.value === 'string') return n.value
  if (Array.isArray(n.children)) return n.children.map(nodeText).join('')
  return ''
}

/** Heading / code / table / image — rendered from the mdast node as-is. */
function AtomicBlock({ block }: { block: Block }) {
  const node = block.node as {
    type?: string
    depth?: number
    lang?: string
    value?: string
    url?: string
    alt?: string
    children?: unknown[]
  }

  if (block.type === 'heading') {
    const depth = Math.min(6, Math.max(1, node.depth ?? 2))
    const Tag = `h${depth}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    return <Tag className="mb-heading">{nodeText(node)}</Tag>
  }

  if (block.type === 'code') {
    const raw = (
      <pre className="mb-code">
        {node.lang && <span className="mb-code-lang">{node.lang}</span>}
        <code>{node.value}</code>
      </pre>
    )
    return isMermaid(node) ? <MermaidDiagram value={node.value ?? ''} fallback={raw} /> : raw
  }

  if (block.type === 'table') {
    const rows = (node.children ?? []) as { children?: unknown[] }[]
    const [head, ...body] = rows
    return (
      <table className="mb-table">
        {head && (
          <thead>
            <tr>
              {(head.children ?? []).map((c, i) => (
                <th key={i}>{nodeText(c)}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>
              {(row.children ?? []).map((c, ci) => (
                <td key={ci}>{nodeText(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // image (bare, or wrapped in a paragraph)
  const asImg = node as { type?: string; url?: string; alt?: string }
  const img =
    asImg.type === 'image'
      ? asImg
      : ((node.children ?? []) as { type?: string; url?: string; alt?: string }[]).find(
          (c) => c.type === 'image',
        )
  if (!img) return null
  return (
    <figure className="mb-image">
      <img src={img.url} alt={img.alt ?? ''} />
      {img.alt && <figcaption>{img.alt}</figcaption>}
    </figure>
  )
}

function Word({ w }: { w: WordToken }) {
  const cls = [w.emphasis.includes('strong') ? 'strong' : '', w.emphasis.includes('em') ? 'em' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <>
      {w.breakBefore && <br />}
      <span data-token-index={w.index} className={cls}>
        {w.text}
      </span>{' '}
    </>
  )
}

function BlockView({ block, tokens }: { block: Block; tokens: Token[] }) {
  if (block.type === 'heading' || block.type === 'code' || block.type === 'table') {
    return <AtomicBlock block={block} />
  }
  const slice = tokens.slice(block.tokenStart, block.tokenEnd + 1)
  if (slice.length === 1 && slice[0].kind === 'atomic') return <AtomicBlock block={block} />

  const words = slice.filter((t): t is WordToken => t.kind === 'word')
  if (words.length === 0) return null

  if (block.type === 'list') {
    // The list block is flattened (nested lists + sub-paragraphs share it).
    // Segment on item start OR breadcrumb change, then indent by nesting depth so
    // sub-lists read as a hierarchy — mirrors SectionView's list rendering.
    const segs: WordToken[][] = []
    let prev = ''
    for (const w of words) {
      const key = w.crumbs.join('>')
      if (w.listItemStart || key !== prev || segs.length === 0) segs.push([])
      prev = key
      segs[segs.length - 1].push(w)
    }
    return (
      <div className="mb-list">
        {segs.map((seg, i) => {
          const cr = seg[0].crumbs
          const depth = Math.max(1, cr.filter((c) => c === 'LIST').length)
          const isPara = cr[cr.length - 1] === 'PARAGRAPH'
          const indent = (isPara ? depth : depth - 1) * 1.6
          return (
            <div
              key={i}
              className={isPara ? 'mb-li-para' : 'mb-li'}
              style={{ marginLeft: `${indent}em` }}
            >
              {seg.map((w) => (
                <Word key={w.index} w={w} />
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  const Tag = block.type === 'blockquote' ? 'blockquote' : 'p'
  return (
    <Tag className={`mb-p ${block.type}`}>
      {words.map((w) => (
        <Word key={w.index} w={w} />
      ))}
    </Tag>
  )
}

export default function MarkdownBlocks({
  markdown,
  className,
}: {
  markdown: string
  /** Extra classes on the root (e.g. a diff chunk's add/del tint). */
  className?: string
}) {
  const { tokens, blocks } = useMemo(() => parseMarkdown(markdown), [markdown])
  if (blocks.length === 0) return null // nothing renderable (e.g. a blank context run)
  return (
    <div className={`mb-prose${className ? ` ${className}` : ''}`}>
      {blocks.map((b) => (
        <BlockView key={b.id} block={b} tokens={tokens} />
      ))}
    </div>
  )
}
