import { useEffect, useRef, useState } from 'react'
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
/** Left gutter reserved for the right-anchored edge labels, so shallow-depth
 *  callees' labels don't clip against the scroll container's left edge. */
const LABEL_GUTTER = 120
const CANVAS_W = LANE_W + LABEL_GUTTER
const PAD = 12
/** Trunk offset into the caller's card; staggered per caller row so two
 *  callers' trunks never share an x. */
const TRUNK_OFF = 14
const STAGGER = 5
/** Horizontal (LR) layout: one column per topological-order stop (reads like a
 *  sequence diagram left→right), one lane per call-graph depth. */
const COL_W = 190
const CARD_W = COL_W - 26
const LANE_H = 96
const CARD_H = 56
const MIN_ZOOM = 0.2
const MAX_ZOOM = 2.5

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

type Layout = 'tb' | 'lr'

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
  const [layout, setLayout] = useState<Layout>('tb')
  // Pan/zoom viewport: the graph canvas is translated+scaled inside a
  // fixed-size clipping viewport instead of natively scrolled.
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const viewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ px: number; py: number; moved: boolean } | null>(null)
  const movedRef = useRef(false)

  const byId = new Map(stops.map((s) => [s.id, s]))
  const order = graph.order
  const rowOf = new Map(order.map((id, i) => [id, i]))
  const maxDepth = order.reduce((m, id) => Math.max(m, graph.depth.get(id) ?? 0), 0)
  // TB: row per topological-order stop, indented by depth (original layout).
  // LR: column per topological-order stop, lane per depth.
  const leftOf = (id: string) =>
    layout === 'tb'
      ? LABEL_GUTTER + PAD + (graph.depth.get(id) ?? 0) * INDENT
      : PAD + (rowOf.get(id) ?? 0) * COL_W
  const topOf = (id: string) =>
    layout === 'tb'
      ? (rowOf.get(id) ?? 0) * ROW_H
      : PAD + (graph.depth.get(id) ?? 0) * LANE_H
  const graphW = layout === 'tb' ? CANVAS_W : PAD * 2 + order.length * COL_W
  const graphH =
    layout === 'tb'
      ? Math.max(order.length * ROW_H, ROW_H)
      : PAD * 2 + (maxDepth + 1) * LANE_H

  const fitView = () => {
    const el = viewRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    const s = clamp(Math.min((r.width - 24) / graphW, (r.height - 24) / graphH, 1), MIN_ZOOM, MAX_ZOOM)
    setView({ x: (r.width - graphW * s) / 2, y: Math.max((r.height - graphH * s) / 2, 12), scale: s })
  }
  // Refit whenever the layout flips (and once on mount).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fitView, [layout])

  // Native wheel listener: React's synthetic onWheel can't preventDefault
  // (passive), and the page behind the overlay must not scroll.
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        const cx = e.clientX - r.left
        const cy = e.clientY - r.top
        setView((v) => {
          const s = clamp(v.scale * Math.exp(-e.deltaY * 0.01), MIN_ZOOM, MAX_ZOOM)
          const k = s / v.scale
          return { scale: s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
        })
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (f: number) => {
    const el = viewRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const cx = r.width / 2
    const cy = r.height / 2
    setView((v) => {
      const s = clamp(v.scale * f, MIN_ZOOM, MAX_ZOOM)
      const k = s / v.scale
      return { scale: s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
    })
  }

  // Drag-to-pan. Nodes stay clickable: a click only counts if the pointer
  // never moved past the 4px threshold (movedRef guards onPick).
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    dragRef.current = { px: e.clientX, py: e.clientY, moved: false }
    movedRef.current = false
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.px
    const dy = e.clientY - d.py
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    if (!d.moved) {
      // Capture only once a real drag starts — capturing on pointerdown would
      // retarget the eventual click to the viewport and swallow node clicks.
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    d.moved = true
    movedRef.current = true
    d.px = e.clientX
    d.py = e.clientY
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
  }
  const onPointerUp = () => {
    dragRef.current = null
  }

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
      // Trunk drops from just below the caller's card in both layouts (TB
      // cards sit at topOf+6 within their ROW_H row; LR cards at topOf).
      const sy = layout === 'tb' ? topOf(from) + ROW_H - 10 : topOf(from) + CARD_H + 4
      const ex = leftOf(to) // callee card's left edge (arrow lands here)
      // Stack multiple incoming stubs a few px apart instead of overlapping.
      const eyBase = layout === 'tb' ? topOf(to) + 22 : topOf(to) + 16
      const ey = Math.min(eyBase + nth * 8, eyBase + 24)
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
          <div className="fm-controls">
            <button
              type="button"
              onClick={() => setLayout((l) => (l === 'tb' ? 'lr' : 'tb'))}
              title="Toggle layout direction"
            >
              {layout === 'tb' ? '⇥ horizontal' : '⤓ vertical'}
            </button>
            <button type="button" onClick={() => zoomBy(1 / 1.25)} title="Zoom out">
              −
            </button>
            <span className="fm-zoom-pct">{Math.round(view.scale * 100)}%</span>
            <button type="button" onClick={() => zoomBy(1.25)} title="Zoom in">
              +
            </button>
            <button type="button" onClick={fitView} title="Fit graph to view">
              fit
            </button>
          </div>
          <button type="button" className="fm-close" onClick={onClose} title="Close (esc)">
            ✕
          </button>
        </div>

        <div
          className="fm-viewport"
          ref={viewRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="fm-canvas"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          >
            <div className="fm-graph" style={{ height: graphH, width: graphW }}>
              <svg className="fm-edges" width={graphW} height={graphH} aria-hidden="true">
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
                    top: layout === 'tb' ? topOf(id) + 6 : topOf(id),
                    left: leftOf(id),
                    width: layout === 'tb' ? CANVAS_W - leftOf(id) - PAD : CARD_W,
                  }}
                  onClick={() => {
                    if (!movedRef.current) onPick(id)
                  }}
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
          </div>
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
  )
}
