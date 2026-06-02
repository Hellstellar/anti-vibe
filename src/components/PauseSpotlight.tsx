import { useEffect, useRef } from 'react'
import { useReader } from '../store/readerStore'
import type { Block, WordToken } from '../lib/types'
import './PauseSpotlight.css'

export default function PauseSpotlight() {
  const tokens = useReader((s) => s.tokens)
  const blocks = useReader((s) => s.blocks)
  const currentIndex = useReader((s) => s.currentIndex)
  const resumeAt = useReader((s) => s.resumeAt)

  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  // Window of blocks around the active one, for surrounding context.
  const activeBlock =
    blocks.find(
      (b) => currentIndex >= b.tokenStart && currentIndex <= b.tokenEnd,
    ) ?? blocks[0]
  const activeId = activeBlock?.id ?? 0
  const visible = blocks.filter((b) => Math.abs(b.id - activeId) <= 1)

  // Point the spotlight at the active word on entry.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const active = container.querySelector<HTMLElement>('.pw.active')
    if (active) {
      const cr = container.getBoundingClientRect()
      const wr = active.getBoundingClientRect()
      setSpot(container, wr.left + wr.width / 2 - cr.left, wr.top + wr.height / 2 - cr.top)
    } else {
      setSpot(container, container.clientWidth / 2, container.clientHeight / 2)
    }
  }, [currentIndex])

  const setSpot = (el: HTMLElement, x: number, y: number) => {
    el.style.setProperty('--spot-x', `${x}px`)
    el.style.setProperty('--spot-y', `${y}px`)
  }

  // Cursor acts as the light source — update CSS vars off the React path.
  const onMove = (e: React.MouseEvent) => {
    const container = containerRef.current
    if (!container) return
    const cr = container.getBoundingClientRect()
    const x = e.clientX - cr.left
    const y = e.clientY - cr.top
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setSpot(container, x, y)
    })
  }

  const onClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-token-index]')
    if (!el) return
    resumeAt(Number(el.dataset.tokenIndex))
  }

  return (
    <div className="pause">
      <div
        ref={containerRef}
        className="pause-context"
        onMouseMove={onMove}
        onClick={onClick}
      >
        {visible.map((b) => (
          <BlockText
            key={b.id}
            block={b}
            tokens={tokens}
            currentIndex={currentIndex}
          />
        ))}
      </div>
      <div className="pause-hint">
        click any word to resume there &nbsp;·&nbsp; space to continue
      </div>
    </div>
  )
}

function BlockText({
  block,
  tokens,
  currentIndex,
}: {
  block: Block
  tokens: ReturnType<typeof useReader.getState>['tokens']
  currentIndex: number
}) {
  const slice = tokens.slice(block.tokenStart, block.tokenEnd + 1)

  // Atomic block (heading/code/table/image): show a compact placeholder.
  if (slice.length === 1 && slice[0].kind === 'atomic') {
    return (
      <div className="pause-block atomic">
        [ {slice[0].blockType} ]
      </div>
    )
  }

  const words = slice.filter((t): t is WordToken => t.kind === 'word')
  const Tag = block.type === 'heading' ? 'h2' : 'p'

  return (
    <Tag className={`pause-block ${block.type}`}>
      {words.map((w) => {
        const cls = [
          'pw',
          w.index === currentIndex ? 'active' : '',
          w.emphasis.includes('strong') ? 'strong' : '',
          w.emphasis.includes('em') ? 'em' : '',
          w.listItem ? 'li' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <span key={w.index} data-token-index={w.index} className={cls}>
            {w.text}{' '}
          </span>
        )
      })}
    </Tag>
  )
}
