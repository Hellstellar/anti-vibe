import type { FlowGraph } from '../lib/flowGraph'
import type { ResolvedFlowStop } from '../lib/types'
import './SequenceMinimap.css'

// Deterministic fixed-row layout — no DOM measurement. Each flow node occupies
// one row (topological order) indented by its call-graph depth; edges are drawn
// as bezier curves between computed node anchors.
const ROW_H = 58
const INDENT = 14
const LANE_W = 240
const PAD = 10

function nodeLabel(stop: ResolvedFlowStop): string {
  return stop.title || stop.file.split('/').pop() || stop.file
}

export default function SequenceMinimap({
  stops,
  graph,
  foundationOrder,
  currentStop,
  history,
  onPick,
}: {
  stops: ResolvedFlowStop[]
  graph: FlowGraph
  foundationOrder: string[]
  currentStop: string | null
  history: string[]
  onPick: (id: string) => void
}) {
  const byId = new Map(stops.map((s) => [s.id, s]))
  const order = graph.order
  const rowOf = new Map(order.map((id, i) => [id, i]))
  const leftOf = (id: string) => PAD + (graph.depth.get(id) ?? 0) * INDENT
  const topOf = (id: string) => (rowOf.get(id) ?? 0) * ROW_H
  const laneH = Math.max(order.length * ROW_H, ROW_H)

  const onPath = new Set([...history, ...(currentStop ? [currentStop] : [])])
  const foundation = foundationOrder
    .map((id) => byId.get(id))
    .filter((s): s is ResolvedFlowStop => !!s)

  // Build edge paths (caller → callee).
  const edges: { d: string; active: boolean; key: string }[] = []
  for (const [from, tos] of graph.callees) {
    for (const to of tos) {
      if (!rowOf.has(from) || !rowOf.has(to)) continue
      const x1 = leftOf(from) + 6
      const y1 = topOf(from) + ROW_H - 8
      const x2 = leftOf(to) + 6
      const y2 = topOf(to) + 8
      const mid = (y1 + y2) / 2
      edges.push({
        key: `${from}->${to}`,
        active: onPath.has(from) && onPath.has(to),
        d: `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`,
      })
    }
  }

  return (
    <aside className="seq-minimap" aria-label="Review call flow">
      <div className="mm-lane-head">CALL FLOW</div>
      <div className="mm-graph" style={{ height: laneH, width: LANE_W }}>
        <svg className="mm-edges" width={LANE_W} height={laneH} aria-hidden="true">
          {edges.map((e) => (
            <path key={e.key} d={e.d} className={`mm-edge${e.active ? ' active' : ''}`} />
          ))}
        </svg>
        {order.map((id) => {
          const stop = byId.get(id)
          if (!stop) return null
          const active = id === currentStop
          return (
            <button
              key={id}
              type="button"
              className={`mm-node${active ? ' active' : ''}${onPath.has(id) ? ' visited' : ''}${stop.context ? ' context' : ''}`}
              style={{
                top: topOf(id) + 6,
                left: leftOf(id),
                width: LANE_W - leftOf(id) - PAD,
              }}
              onClick={() => onPick(id)}
              title={stop.file}
            >
              <span className="mm-node-label">{nodeLabel(stop)}</span>
              <span className="mm-node-file">{stop.file.split('/').pop()}</span>
            </button>
          )
        })}
      </div>

      {foundation.length > 0 && (
        <div className="mm-lane mm-lane-foundation">
          <div className="mm-lane-head">FOUNDATION ↑</div>
          {foundation.map((stop) => (
            <button
              key={stop.id}
              type="button"
              className={`mm-node mm-foundation${stop.id === currentStop ? ' active' : ''}`}
              onClick={() => onPick(stop.id)}
              title={stop.file}
            >
              <span className="mm-node-label">{nodeLabel(stop)}</span>
              <span className="mm-node-file">{stop.file.split('/').pop()}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  )
}
