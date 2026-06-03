import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { useReader } from '../store/readerStore'
import type { Block, Token, WordToken } from '../lib/types'
import './SectionView.css'

/** Flatten an mdast node to plain text. */
function nodeText(node: any): string {
  if (!node) return ''
  if (typeof node.value === 'string') return node.value
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('')
  return ''
}

/** Render an atomic block (code / table / image) as-is. */
function AtomicBlock({ block }: { block: Block }) {
  const node: any = block.node
  if (block.type === 'code') {
    return (
      <pre className="sv-code">
        {node.lang && <span className="sv-code-lang">{node.lang}</span>}
        <code>{node.value}</code>
      </pre>
    )
  }
  if (block.type === 'table') {
    const rows = (node.children ?? []) as any[]
    const [head, ...body] = rows
    return (
      <table className="sv-table">
        {head && (
          <thead>
            <tr>
              {(head.children ?? []).map((c: any, i: number) => (
                <th key={i}>{nodeText(c)}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row: any, r: number) => (
            <tr key={r}>
              {(row.children ?? []).map((c: any, ci: number) => (
                <td key={ci}>{nodeText(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  const img =
    node.type === 'image' ? node : (node.children ?? []).find((c: any) => c.type === 'image')
  if (!img) return null
  return (
    <figure className="sv-image">
      <img src={img.url} alt={img.alt ?? ''} />
      {img.alt && <figcaption>{img.alt}</figcaption>}
    </figure>
  )
}

function Word({ w, active }: { w: WordToken; active: boolean }) {
  const cls = [
    'pw',
    active ? 'active' : '',
    w.emphasis.includes('strong') ? 'strong' : '',
    w.emphasis.includes('em') ? 'em' : '',
  ]
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

function ContentBlock({
  block,
  tokens,
  currentIndex,
}: {
  block: Block
  tokens: Token[]
  currentIndex: number
}) {
  if (block.type === 'heading' || block.type === 'code' || block.type === 'table') {
    return <AtomicBlock block={block} />
  }
  const slice = tokens.slice(block.tokenStart, block.tokenEnd + 1)
  if (slice.length === 1 && slice[0].kind === 'atomic') {
    return <AtomicBlock block={block} />
  }

  const words = slice.filter((t): t is WordToken => t.kind === 'word')
  if (words.length === 0) return null

  if (block.type === 'list') {
    const items: WordToken[][] = []
    for (const w of words) {
      if (w.listItemStart || items.length === 0) items.push([])
      items[items.length - 1].push(w)
    }
    return (
      <ul className="sv-block list">
        {items.map((item, i) => (
          <li key={i} className="sv-li">
            {item.map((w) => (
              <Word key={w.index} w={w} active={w.index === currentIndex} />
            ))}
          </li>
        ))}
      </ul>
    )
  }

  const Tag = block.type === 'blockquote' ? 'blockquote' : 'p'
  return (
    <Tag className={`sv-block ${block.type}`}>
      {words.map((w) => (
        <Word key={w.index} w={w} active={w.index === currentIndex} />
      ))}
    </Tag>
  )
}

export default function SectionView() {
  const tokens = useReader((s) => s.tokens)
  const blocks = useReader((s) => s.blocks)
  const sections = useReader((s) => s.sections)
  const currentSection = useReader((s) => s.currentSection)
  const revealed = useReader((s) => s.revealed)
  const currentIndex = useReader((s) => s.currentIndex)
  const rsvpFrom = useReader((s) => s.rsvpFrom)
  const nextSection = useReader((s) => s.nextSection)
  const prevSection = useReader((s) => s.prevSection)
  const spotlightRadius = useReader((s) => s.cfg.spotlightRadius)
  const setCfg = useReader((s) => s.setCfg)

  const scrollRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [hasX, setHasX] = useState(false)

  const section = sections[currentSection]

  const updateScrollCue = () => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 8)
    setHasX(el.scrollWidth > el.clientWidth + 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8)
  }

  const setSpot = (el: HTMLElement, x: number, y: number) => {
    el.style.setProperty('--spot-x', `${x}px`)
    el.style.setProperty('--spot-y', `${y}px`)
  }

  // Cursor is the light source — update CSS vars off the React path.
  const onMove = (e: React.MouseEvent) => {
    const el = scrollRef.current
    if (!el) return
    const cr = el.getBoundingClientRect()
    const x = e.clientX - cr.left
    const y = e.clientY - cr.top
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setSpot(el, x, y)
    })
  }

  // Cmd/Ctrl + scroll adjusts the illumination radius (instead of scrolling).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.metaKey && !e.ctrlKey) return
      e.preventDefault()
      const step = e.deltaY > 0 ? -12 : 12
      // Read the live value so rapid wheels don't all compute off a stale base.
      const cur = useReader.getState().cfg.spotlightRadius
      setCfg({ spotlightRadius: cur + step })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setCfg])

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
  }, [])

  // Keyboard: collapsed -> skip headings; revealed -> scroll the section.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      const down = e.key === 'ArrowDown' || e.key === 'ArrowRight'
      const up = e.key === 'ArrowUp' || e.key === 'ArrowLeft'
      if (!down && !up) return
      e.preventDefault()
      if (!revealed) {
        if (down) nextSection()
        else prevSection()
        return
      }
      const el = scrollRef.current
      if (!el) return
      // No explicit behavior — CSS `scroll-behavior: smooth` animates it.
      el.scrollBy({ top: (down ? 1 : -1) * el.clientHeight * 0.45 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, nextSection, prevSection])

  // On reveal / section change reset scroll to top; when paused mid-section,
  // bring the active (current) word into view.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const active = el.querySelector<HTMLElement>('.pw.active')
    if (active) active.scrollIntoView({ block: 'center', behavior: 'smooth' })
    else el.scrollTo({ top: 0 })
    updateScrollCue()
  }, [currentSection, revealed, currentIndex])

  const onClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-token-index]')
    if (!el) return
    rsvpFrom(Number(el.dataset.tokenIndex))
  }

  if (!section) return null

  const headingBlock = section.hasHeading ? blocks[section.blockStart] : null
  const contentBlocks = blocks.slice(
    section.blockStart + (headingBlock ? 1 : 0),
    section.blockEnd + 1,
  )
  const hasContent = contentBlocks.length > 0

  return (
    <div className="section">
      <div
        ref={scrollRef}
        className={`section-context${hasX ? ' has-x' : ''}`}
        style={{ '--spot-r': `${spotlightRadius}px` } as CSSProperties}
        onMouseMove={onMove}
        onScroll={updateScrollCue}
        onClick={onClick}
      >
        {headingBlock && <h2 className="sv-block heading">{section.title}</h2>}
        {!section.hasHeading && !revealed && (
          <div className="sv-start">▸ start of document</div>
        )}

        {revealed &&
          contentBlocks.map((b) => (
            <ContentBlock
              key={b.id}
              block={b}
              tokens={tokens}
              currentIndex={currentIndex}
            />
          ))}
        {revealed && !hasContent && (
          <div className="sv-empty">(no content under this heading)</div>
        )}
      </div>

      {revealed && canScrollDown && (
        <div className="scroll-cue" aria-hidden="true">▼</div>
      )}
      {revealed && canScrollRight && (
        <div className="scroll-cue-x" aria-hidden="true">▶</div>
      )}

      <div className="section-hint">
        {!revealed
          ? 'enter ▸ reveal · ↑↓ ▸ skip heading · shift+enter ▸ previous · esc ▸ exit'
          : 'click ▸ rsvp · cmd+enter ▸ step · ↑↓ ▸ scroll · enter ▸ next'}
      </div>
    </div>
  )
}
