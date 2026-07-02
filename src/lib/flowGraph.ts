import type { ResolvedFlowStop } from './types'

/**
 * Call-graph model over a review's `flow` stops. Navigation follows `callsTo`
 * edges (a DAG), not array order — so a review can branch, have several entry
 * points, and be walked caller→callee. When a review has no edges at all it
 * degrades to the given linear order.
 */
export interface FlowGraph {
  /** Topological order of flow stop ids (callers before callees; array order
   *  breaks ties and cycles). Drives the minimap's vertical layout. */
  order: string[]
  /** stop id → ids it calls into (existing flow stops only, de-duped). */
  callees: Map<string, string[]>
  /** stop id → ids that call it. */
  callers: Map<string, string[]>
  /** BFS depth from the nearest entry point (root = 0). Drives indentation. */
  depth: Map<string, number>
  /** Flow stops with no callers — the review's entry points. */
  roots: string[]
}

/** Build the call graph from the `flow` stops (foundation stops are excluded —
 *  they sit in their own lane and are reached directly). */
export function buildFlowGraph(stops: ResolvedFlowStop[], flowOrder: string[]): FlowGraph {
  const flowIds = new Set(flowOrder)
  const callees = new Map<string, string[]>()
  const callers = new Map<string, string[]>()
  for (const id of flowOrder) {
    callees.set(id, [])
    callers.set(id, [])
  }

  const byId = new Map(stops.map((s) => [s.id, s]))
  for (const id of flowOrder) {
    const targets = (byId.get(id)?.callsTo ?? []).filter((t) => flowIds.has(t) && t !== id)
    const uniq = [...new Set(targets)]
    callees.set(id, uniq)
    for (const t of uniq) callers.get(t)!.push(id)
  }

  const roots = flowOrder.filter((id) => (callers.get(id) ?? []).length === 0)
  const order = topoSort(flowOrder, callees, roots)
  const depth = bfsDepth(order, callees, roots.length ? roots : flowOrder.slice(0, 1))

  return { order, callees, callers, depth, roots }
}

/** Kahn-style topological sort; falls back to input order for any nodes left
 *  in a cycle so the result is always a full permutation of `flowOrder`. */
function topoSort(
  flowOrder: string[],
  callees: Map<string, string[]>,
  roots: string[],
): string[] {
  const indeg = new Map<string, number>()
  for (const id of flowOrder) indeg.set(id, 0)
  for (const id of flowOrder) for (const t of callees.get(id)!) indeg.set(t, (indeg.get(t) ?? 0) + 1)

  // Seed with roots in input order, then any other zero-indegree nodes.
  const queue = flowOrder.filter((id) => indeg.get(id) === 0)
  void roots
  const seen = new Set<string>()
  const out: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    for (const t of callees.get(id)!) {
      indeg.set(t, (indeg.get(t) ?? 1) - 1)
      if ((indeg.get(t) ?? 0) <= 0) queue.push(t)
    }
  }
  // Append anything stuck in a cycle, preserving input order.
  for (const id of flowOrder) if (!seen.has(id)) out.push(id)
  return out
}

function bfsDepth(
  order: string[],
  callees: Map<string, string[]>,
  roots: string[],
): Map<string, number> {
  const depth = new Map<string, number>()
  const queue: string[] = []
  for (const r of roots) {
    depth.set(r, 0)
    queue.push(r)
  }
  while (queue.length) {
    const id = queue.shift()!
    const d = depth.get(id) ?? 0
    for (const t of callees.get(id) ?? []) {
      if (!depth.has(t) || depth.get(t)! > d + 1) {
        depth.set(t, d + 1)
        queue.push(t)
      }
    }
  }
  // Any node not reached (cycle / disconnected) gets depth by order position 0.
  for (const id of order) if (!depth.has(id)) depth.set(id, 0)
  return depth
}
