import { useLayoutEffect, useRef } from 'react'
import { useReader } from '../store/readerStore'
import type { StepUnit, WordToken } from '../lib/types'
import './StepView.css'

const MIN_FONT_PX = 16

function nodeText(node: any): string {
  if (!node) return ''
  if (typeof node.value === 'string') return node.value
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('')
  return ''
}

function words(ws: WordToken[]) {
  return ws.map((w) => {
    const cls = [
      'sw',
      w.code ? 'sw-code' : '',
      w.emphasis.includes('strong') ? 'strong' : '',
      w.emphasis.includes('em') ? 'em' : '',
    ]
      .filter(Boolean)
      .join(' ')
    return (
      <span key={w.index}>
        <span data-token-index={w.index} className={cls}>
          {w.text}
        </span>{' '}
      </span>
    )
  })
}

function UnitBody({ unit }: { unit: StepUnit }) {
  switch (unit.kind) {
    case 'sentence':
    case 'quote':
      return <p className="step-text">{words(unit.words ?? [])}</p>
    case 'listItem':
      return (
        <p className="step-text step-li">
          <span className="step-bullet">▸ </span>
          {words(unit.words ?? [])}
        </p>
      )
    case 'code':
      return (
        <pre className="step-code">
          {(unit.node as any)?.lang && (
            <span className="step-code-lang">{(unit.node as any).lang}</span>
          )}
          <code>{(unit.node as any)?.value}</code>
        </pre>
      )
    case 'image': {
      const node: any = unit.node
      const img =
        node?.type === 'image'
          ? node
          : (node?.children ?? []).find((c: any) => c.type === 'image')
      if (!img) return null
      return (
        <figure className="step-image">
          <img src={img.url} alt={img.alt ?? ''} />
          {img.alt && <figcaption>{img.alt}</figcaption>}
        </figure>
      )
    }
    case 'tableRow': {
      const node: any = unit.node
      const rows = (node?.children ?? []) as any[]
      const header = rows[0]?.children ?? []
      const row = rows[unit.rowIndex ?? 0]?.children ?? []
      return (
        <table className="step-record">
          <tbody>
            {row.map((cell: any, i: number) => (
              <tr key={i}>
                <th>{nodeText(header[i])}</th>
                <td>{nodeText(cell)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
    default:
      return null
  }
}

export default function StepView() {
  const stepUnits = useReader((s) => s.stepUnits)
  const stepIndex = useReader((s) => s.stepIndex)
  const rsvpFrom = useReader((s) => s.rsvpFrom)
  const stepNext = useReader((s) => s.stepNext)
  const stepPrev = useReader((s) => s.stepPrev)

  const bodyRef = useRef<HTMLDivElement>(null)
  const unit = stepUnits[stepIndex]

  // Shrink the sentence/list-item text so the whole unit fits one screen —
  // no scrolling. (For a huge one, click a word to speed-read it instead.)
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const text = body.querySelector<HTMLElement>('.step-text')
    if (!text) return
    text.style.fontSize = ''
    let guard = 0
    // Shrink until the unit fits both ways — tall units (many lines) and wide
    // ones (long unbreakable tokens) both get scaled down before wrapping.
    while (
      (text.scrollHeight > body.clientHeight ||
        body.scrollWidth > body.clientWidth + 1) &&
      guard < 60
    ) {
      const cur = parseFloat(getComputedStyle(text).fontSize)
      if (cur <= MIN_FONT_PX) break
      text.style.fontSize = `${Math.max(MIN_FONT_PX, cur * 0.93)}px`
      guard++
    }
  }, [stepIndex, unit])

  if (!unit) return null

  // Click a word -> RSVP from there (escape hatch for very long units).
  const onClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-token-index]')
    if (el) rsvpFrom(Number(el.dataset.tokenIndex))
  }

  return (
    <div className="step">
      {/* keyed by groupId so the label re-animates when the block changes */}
      <div key={unit.groupId} className="step-context">
        {unit.label}
      </div>

      <div key={stepIndex} ref={bodyRef} className="step-body" onClick={onClick}>
        <UnitBody unit={unit} />
      </div>

      {stepIndex > 0 && (
        <button className="step-nav prev" title="Previous (←)" onClick={stepPrev}>
          ‹
        </button>
      )}
      {stepIndex < stepUnits.length - 1 && (
        <button className="step-nav next" title="Next (→)" onClick={stepNext}>
          ›
        </button>
      )}
    </div>
  )
}
