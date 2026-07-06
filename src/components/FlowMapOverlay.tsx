import { useState } from 'react'
import type { FlowGraph } from '../lib/flowGraph'
import type { ResolvedFlowStop } from '../lib/types'
import './FlowMapOverlay.css'

// Full call-graph canvas, opened from the minimap or `m`. Deterministic
// fixed-row layout — no DOM measurement: each flow node occupies one row
// (topological order) indented by its call-graph depth. Edges are orthogonal
// tree-guide connectors: a trunk drops from under the caller into the gutter
// its children are indented into, then elbows right into each callee's left
// edge (arrowhead at entry). Children of one caller overlap on the shared
// trunk, so sibling groups read as one guide line. Node cards reuse the
// .mm-node styles from SequenceMinimap.css; this file adds chrome + routing.
const ROW_H = 64
const INDENT = 40
const LANE_W = 560
const PAD = 12
/** Trunk offset into the caller's card; staggered per caller row so two
 *  callers' trunks never share an x. */
const TRUNK_OFF = 14
const STAGGER = 5

function nodeLabel(stop: ResolvedFlowStop): string {
  return stop.title || stop.file.split('/').pop() || stop.file
}

export default function FlowMapOverlay({
  stops,
  graph,
  foundationOrder,
  currentStop,
  history,
  onPick,
  onClose,
}: {
  stops: ResolvedFlowStop[]
  graph: FlowGraph
  foundationOrder: string[]
  currentStop: string | null
  history: string[]
  onPick: (id: string) => void
  onClose: () => void
}) {
  const [hoverId, setHoverId] = useState<string | null>(null)

  const byId = new Map(stops.map((s) => [s.id, s]))
  const order = graph.order
  const rowOf = new Map(order.map((id, i) => [id, i]))
  const leftOf = (id: string) => PAD + (graph.depth.get(id) ?? 0) * INDENT
  const topOf = (id: string) => (rowOf.get(id) ?? 0) * ROW_H
  const graphH = Math.max(order.length * ROW_H, ROW_H)

  const onPath = new Set([...history, ...(currentStop ? [currentStop] : [])])
  const foundation = foundationOrder
    .map((id) => byId.get(id))
    .filter((s): s is ResolvedFlowStop => !!s)

  // Build orthogonal edge paths (caller → callee) with the caller-side
  // function as the label. `cross` marks non-parent edges (skip-level, extra
  // caller, back edge) — drawn dashed so the primary tree stays dominant.
  const edges: {
    key: string
    from: string
    to: string
    d: string
    active: boolean
    cross: boolean
    via?: string
    lx: number
    ly: number
  }[] = []
  const entryCount = new Map<string, number>() // per-callee incoming edges seen
  for (const [from, tos] of graph.callees) {
    for (const { to, via } of tos) {
      if (!rowOf.has(from) || !rowOf.has(to)) continue
      const nth = entryCount.get(to) ?? 0
      entryCount.set(to, nth + 1)

      const sx = leftOf(from) + TRUNK_OFF + (rowOf.get(from)! % 4) * STAGGER
      const sy = topOf(from) + ROW_H - 10 // just below the caller's card
      const ex = leftOf(to) // callee card's left edge (arrow lands here)
      // Stack multiple incoming stubs a few px apart instead of overlapping.
      const ey = Math.min(topOf(to) + 22 + nth * 8, topOf(to) + 46)
      // Trunk must sit left of the callee card to enter it; for back/cross
      // edges that means jogging left of the caller first.
      const tx = Math.min(sx, ex - 8)

      edges.push({
        key: `${from}->${to}`,
        from,
        to,
        active: onPath.has(from) && onPath.has(to),
        cross: (graph.depth.get(to) ?? 0) !== (graph.depth.get(from) ?? 0) + 1,
        d: `M ${sx} ${sy}${tx !== sx ? ` H ${tx}` : ''} V ${ey} H ${ex}`,
        via,
        // Label rides the entry stub, right-aligned into the gutter.
        lx: ex - 6,
        ly: ey - 5,
      })
    }
  }

  /** Hover tracing: edges touching the hovered node light up, the rest recede. */
  const edgeState = (e: { from: string; to: string }) =>
    hoverId ? (e.from === hoverId || e.to === hoverId ? ' hl' : ' dim') : ''

  return (
    <div className="flow-map" role="dialog" aria-modal="true" aria-label="Call flow map" onClick={onClose}>
      <div className="fm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="fm-head">
          <span className="fm-title">CALL FLOW MAP</span>
          <button type="button" className="fm-close" onClick={onClose} title="Close (esc)">
            ✕
          </button>
        </div>

        <div className="fm-scroll">
          <div className="fm-graph" style={{ height: graphH, width: LANE_W }}>
            <svg className="fm-edges" width={LANE_W} height={graphH} aria-hidden="true">
              <defs>
                <marker
                  id="fm-arrow"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
                </marker>
              </defs>
              {edges.map((e) => (
                <g key={e.key}>
                  <path
                    d={e.d}
                    markerEnd="url(#fm-arrow)"
                    className={`fm-edge${e.cross ? ' cross' : ''}${e.active ? ' active' : ''}${edgeState(e)}`}
                  />
                  {e.via && (
                    <text
                      x={e.lx}
                      y={e.ly}
                      className={`fm-edge-label${e.active ? ' active' : ''}${edgeState(e)}`}
                    >
                      {e.via}
                    </text>
                  )}
                </g>
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
                  onMouseEnter={() => setHoverId(id)}
                  onMouseLeave={() => setHoverId(null)}
                  title={stop.file}
                >
                  <span className="mm-node-label">{nodeLabel(stop)}</span>
                  <span className="mm-node-file">{stop.file.split('/').pop()}</span>
                </button>
              )
            })}
          </div>

          {foundation.length > 0 && (
            <div className="fm-foundation">
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
        </div>
      </div>
    </div>
  )
}
