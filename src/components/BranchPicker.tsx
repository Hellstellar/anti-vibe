import type { ResolvedFlowStop } from '../lib/types'
import './BranchPicker.css'

/** Shown when the current stop calls into several others — the reviewer picks
 *  which branch to follow (click or press 1-9). */
export default function BranchPicker({
  options,
  onPick,
  onCancel,
}: {
  options: { stop: ResolvedFlowStop; via?: string }[]
  onPick: (id: string) => void
  onCancel: () => void
}) {
  return (
    <div className="branch-scrim" onClick={onCancel}>
      <div className="branch-card" onClick={(e) => e.stopPropagation()}>
        <div className="branch-head">This step calls into {options.length} paths — pick one</div>
        <ul className="branch-list">
          {options.map((o, i) => (
            <li key={o.stop.id}>
              <button className="branch-item" onClick={() => onPick(o.stop.id)}>
                <span className="branch-key">{i + 1}</span>
                <span className="branch-title">{o.stop.title}</span>
                {o.via && <span className="branch-via">via {o.via}</span>}
                <span className="branch-file">{o.stop.file}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="branch-hint">Press 1–{options.length} · Esc to cancel</div>
      </div>
    </div>
  )
}
