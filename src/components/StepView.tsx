import { useReader } from '../store/readerStore'
import type { StepUnit, WordToken } from '../lib/types'
import './StepView.css'

function nodeText(node: any): string {
  if (!node) return ''
  if (typeof node.value === 'string') return node.value
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('')
  return ''
}

function words(ws: WordToken[]) {
  return ws.map((w) => {
    const cls = [
      w.emphasis.includes('strong') ? 'strong' : '',
      w.emphasis.includes('em') ? 'em' : '',
    ]
      .filter(Boolean)
      .join(' ')
    return (
      <span key={w.index} className={cls}>
        {w.text}{' '}
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

  const unit = stepUnits[stepIndex]
  if (!unit) return null

  return (
    <div className="step">
      {/* keyed by groupId so the label re-animates when the block changes */}
      <div key={unit.groupId} className="step-context">
        {unit.label}
      </div>

      <div key={stepIndex} className="step-body step-scroll">
        <UnitBody unit={unit} />
      </div>

      <div className="step-progress">
        {stepIndex + 1} / {stepUnits.length}
      </div>
      <div className="step-hint">
        enter ▸ next · shift+enter ▸ prev · ← → ▸ section · cmd+enter ▸ rsvp · esc ▸ back
      </div>
    </div>
  )
}
