import dagre from '@dagrejs/dagre'
import type { FlowGraph } from './flowGraph'

/**
 * Dagre-based layout for the call flow map. Pure: FlowGraph in, absolute
 * coordinates out — the overlay only renders. Dagre owns node placement, edge
 * routing (polyline points that dodge nodes), and edge-label placement (labels
 * participate in layout, so they get their own space instead of overlapping
 * cards or each other).
 *
 * Kept separate from the component so it stays testable in the node test env,
 * and so the component can lazy-import it (dagre only loads when the map opens).
 */

/** Fixed card size; dagre needs dimensions up front (no DOM measurement). */
export const NODE_W = 220
export const NODE_H = 52

/** Approx label box for a 0.6rem monospace italic string. */
const LABEL_CHAR_W = 6.4
const LABEL_H = 14
const LABEL_MAX_CHARS = 42

export interface LayoutNode {
  /** Top-left corner. */
  x: number
  y: number
}

export interface LayoutEdge {
  key: string
  from: string
  to: string
  via?: string
  /** Polyline route, start → end (arrowhead lands on the last point). */
  points: { x: number; y: number }[]
  /** Label center, present when `via` is. */
  label?: { x: number; y: number }
}

export interface FlowLayout {
  nodes: Map<string, LayoutNode>
  edges: LayoutEdge[]
  width: number
  height: number
}

export function layoutFlow(graph: FlowGraph, dir: 'TB' | 'LR'): FlowLayout {
  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: dir,
    ranksep: 56,
    nodesep: 20,
    edgesep: 16,
    marginx: 16,
    marginy: 16,
    acyclicer: 'greedy',
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const id of graph.order) g.setNode(id, { width: NODE_W, height: NODE_H })
  for (const [from, tos] of graph.callees) {
    for (const { to, via } of tos) {
      if (!g.hasNode(from) || !g.hasNode(to) || from === to) continue
      g.setEdge(
        from,
        to,
        via
          ? {
              width: Math.min(via.length, LABEL_MAX_CHARS) * LABEL_CHAR_W + 8,
              height: LABEL_H,
              labelpos: 'c',
            }
          : {},
      )
    }
  }

  dagre.layout(g)

  const nodes = new Map<string, LayoutNode>()
  for (const id of g.nodes()) {
    const n = g.node(id)
    nodes.set(id, { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 })
  }

  const byId = new Map<string, { to: string; via?: string }[]>()
  for (const [from, tos] of graph.callees) byId.set(from, tos)

  const edges: LayoutEdge[] = []
  for (const e of g.edges()) {
    const laid = g.edge(e)
    const via = byId.get(e.v)?.find((t) => t.to === e.w)?.via
    edges.push({
      key: `${e.v}->${e.w}`,
      from: e.v,
      to: e.w,
      via,
      points: laid.points ?? [],
      label: via && laid.x !== undefined ? { x: laid.x, y: laid.y } : undefined,
    })
  }

  const attrs = g.graph()
  return {
    nodes,
    edges,
    width: Math.max(attrs.width ?? 0, NODE_W),
    height: Math.max(attrs.height ?? 0, NODE_H),
  }
}
