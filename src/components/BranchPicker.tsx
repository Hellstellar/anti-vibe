import type { ResolvedFlowStop } from '../lib/types'
import './BranchPicker.css'

/** Shown when the current stop calls into several others — the reviewer picks
 *  which branch to follow (click or press 1-9). */
export default function BranchPicker({
  stops,
  onPick,
  onCancel,
}: {
  stops: ResolvedFlowStop[]
  onPick: (id: string) => void
  onCancel: () => void
}) {
  return (
    <div className="branch-scrim" onClick={onCancel}>
      <div className="branch-card" onClick={(e) => e.stopPropagation()}>
        <div className="branch-head">This step calls into {stops.length} paths — pick one</div>
        <ul className="branch-list">
          {stops.map((s, i) => (
            <li key={s.id}>
              <button className="branch-item" onClick={() => onPick(s.id)}>
                <span className="branch-key">{i + 1}</span>
                <span className="branch-title">{s.title}</span>
                <span className="branch-file">{s.file}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="branch-hint">Press 1–{stops.length} · Esc to cancel</div>
      </div>
    </div>
  )
}
