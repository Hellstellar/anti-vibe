import { useEffect, useRef, useState } from 'react'
import type { FlowGraph } from '../lib/flowGraph'
import type { FlowLayout } from '../lib/flowLayout'
import type { ResolvedFlowStop } from '../lib/types'
import './FlowMapOverlay.css'

// Full call-graph canvas, opened from the minimap or `m`. Layout (node
// placement, edge routing, edge-label placement) is delegated to dagre via
// src/lib/flowLayout — lazy-imported so dagre only loads when the map opens.
// This file owns the chrome: the pan/zoom viewport, node cards (reusing the
// .mm-node styles from SequenceMinimap.css), hover tracing, and click-to-fit
// on edges whose endpoints sit far apart.
const NODE_W = 220
const NODE_H = 52
const MIN_ZOOM = 0.2
const MAX_ZOOM = 2.5
const FIT_PAD = 24

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

type Layout = 'tb' | 'lr'

function nodeLabel(stop: ResolvedFlowStop): string {
  return stop.title || stop.file.split('/').pop() || stop.file
}

function edgePath(points: { x: number; y: number }[]): string {
  if (!points.length) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
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
  const [laid, setLaid] = useState<FlowLayout | null>(null)
  // Pan/zoom viewport: the graph canvas is translated+scaled inside a
  // fixed-size clipping viewport.
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const viewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ px: number; py: number; moved: boolean } | null>(null)
  const movedRef = useRef(false)

  const byId = new Map(stops.map((s) => [s.id, s]))

  useEffect(() => {
    let live = true
    import('../lib/flowLayout').then((m) => {
      if (live) setLaid(m.layoutFlow(graph, layout === 'tb' ? 'TB' : 'LR'))
    })
    return () => {
      live = false
    }
  }, [graph, layout])

  const onPath = new Set([...history, ...(currentStop ? [currentStop] : [])])
  const foundation = foundationOrder
    .map((id) => byId.get(id))
    .filter((s): s is ResolvedFlowStop => !!s)

  /** Fit the given rect (canvas coordinates) into the viewport. */
  const fitRect = (x: number, y: number, w: number, h: number) => {
    const el = viewRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    const s = clamp(Math.min(r.width / (w + FIT_PAD * 2), r.height / (h + FIT_PAD * 2), 1), MIN_ZOOM, MAX_ZOOM)
    setView({
      x: (r.width - w * s) / 2 - x * s,
      y: (r.height - h * s) / 2 - y * s,
      scale: s,
    })
  }

  const fitView = () => {
    if (laid) fitRect(0, 0, laid.width, laid.height)
  }

  /** Fit both endpoints of an edge — the escape hatch for long edges whose
   *  nodes never share a screen. */
  const fitEdge = (from: string, to: string) => {
    const a = laid?.nodes.get(from)
    const b = laid?.nodes.get(to)
    if (!a || !b) return
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    fitRect(x, y, Math.max(a.x, b.x) + NODE_W - x, Math.max(a.y, b.y) + NODE_H - y)
  }

  // Refit whenever a fresh layout lands (open + direction toggle).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fitView, [laid])

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

  // Drag-to-pan. Nodes and edges stay clickable: a click only counts if the
  // pointer never moved past the 4px threshold (movedRef guards the handlers).
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

  /** Non-parent edges (skip-level, extra caller, back edge) draw dashed so
   *  the primary call tree stays dominant. */
  const isCross = (from: string, to: string) =>
    (graph.depth.get(to) ?? 0) !== (graph.depth.get(from) ?? 0) + 1

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
          {laid && (
            <div
              className="fm-canvas"
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
            >
              <div className="fm-graph" style={{ height: laid.height, width: laid.width }}>
                <svg className="fm-edges" width={laid.width} height={laid.height} aria-hidden="true">
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
                  {laid.edges.map((e) => {
                    const active = onPath.has(e.from) && onPath.has(e.to)
                    const d = edgePath(e.points)
                    return (
                      <g key={e.key}>
                        <path
                          d={d}
                          markerEnd="url(#fm-arrow)"
                          className={`fm-edge${isCross(e.from, e.to) ? ' cross' : ''}${active ? ' active' : ''}${edgeState(e)}`}
                        />
                        <path
                          d={d}
                          className="fm-edge-hit"
                          style={{ strokeWidth: 14 / view.scale }}
                          onClick={() => {
                            if (!movedRef.current) fitEdge(e.from, e.to)
                          }}
                        >
                          <title>{`${e.via ?? 'calls'} — click to fit both ends`}</title>
                        </path>
                        {e.via && e.label && (
                          <text
                            x={e.label.x}
                            y={e.label.y + 3}
                            className={`fm-edge-label${active ? ' active' : ''}${edgeState(e)}`}
                          >
                            {e.via}
                          </text>
                        )}
                      </g>
                    )
                  })}
                </svg>
                {graph.order.map((id) => {
                  const stop = byId.get(id)
                  const pos = laid.nodes.get(id)
                  if (!stop || !pos) return null
                  const active = id === currentStop
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`mm-node${active ? ' active' : ''}${onPath.has(id) ? ' visited' : ''}${stop.context ? ' context' : ''}`}
                      style={{ top: pos.y, left: pos.x, width: NODE_W, height: NODE_H }}
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
          )}
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
