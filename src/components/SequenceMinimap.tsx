import type { FlowGraph } from '../lib/flowGraph'
import type { ResolvedFlowStop } from '../lib/types'
import './SequenceMinimap.css'

// Collapsed "you are here" view of the call graph: the current stop with its
// direct callers (where you came from) above and callees (where you can go)
// below. Everything else is elided behind a count that opens the full-graph
// FlowMapOverlay (`m`), so the rail stays a fixed, glanceable size and never
// crowds the foundation lane.

function nodeLabel(stop: ResolvedFlowStop): string {
  return stop.title || stop.file.split('/').pop() || stop.file
}

export default function SequenceMinimap({
  stops,
  graph,
  foundationOrder,
  currentStop,
  onPick,
  onOpenMap,
}: {
  stops: ResolvedFlowStop[]
  graph: FlowGraph
  foundationOrder: string[]
  currentStop: string | null
  onPick: (id: string) => void
  onOpenMap: () => void
}) {
  const byId = new Map(stops.map((s) => [s.id, s]))
  const resolve = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((s): s is ResolvedFlowStop => !!s)

  const current = currentStop ? byId.get(currentStop) : undefined
  const callers = currentStop ? resolve(graph.callers.get(currentStop) ?? []) : []
  const callees = (currentStop ? (graph.callees.get(currentStop) ?? []) : [])
    .map((edge) => ({ stop: byId.get(edge.to), via: edge.via }))
    .filter((c): c is { stop: ResolvedFlowStop; via: string | undefined } => !!c.stop)
  const foundation = resolve(foundationOrder)

  // Flow-lane stops not visible in the collapsed neighborhood.
  const shownFlow = (current?.layer === 'flow' ? 1 : 0) + callers.length + callees.length
  const elided = Math.max(0, graph.order.length - shownFlow)

  const node = (stop: ResolvedFlowStop, extra = '', via?: string) => (
    <button
      key={stop.id}
      type="button"
      className={`mm-node${extra}${stop.context ? ' context' : ''}`}
      onClick={() => onPick(stop.id)}
      title={stop.file}
    >
      {via && <span className="mm-node-via">via {via}</span>}
      <span className="mm-node-label">{nodeLabel(stop)}</span>
      <span className="mm-node-file">{stop.file.split('/').pop()}</span>
    </button>
  )

  return (
    <aside className="seq-minimap" aria-label="Review call flow">
      <div className="mm-head-row">
        <div className="mm-lane-head">CALL FLOW</div>
        <button
          type="button"
          className="mm-map-toggle"
          onClick={onOpenMap}
          title="Open the full flow map (m)"
        >
          map ⤢
        </button>
      </div>

      {callers.length > 0 && (
        <div className="mm-group">
          <div className="mm-group-head">from ▲</div>
          {callers.map((s) => node(s))}
        </div>
      )}

      {current && current.layer === 'flow' && node(current, ' active')}

      {callees.length > 0 && (
        <div className="mm-group">
          <div className="mm-group-head">calls ▼</div>
          {callees.map((c) => node(c.stop, '', c.via))}
        </div>
      )}

      {elided > 0 && (
        <button type="button" className="mm-elided" onClick={onOpenMap}>
          +{elided} more · map
        </button>
      )}

      {foundation.length > 0 && (
        <div className="mm-lane mm-lane-foundation">
          <div className="mm-lane-head">FOUNDATION ↑</div>
          {foundation.map((stop) =>
            node(stop, ` mm-foundation${stop.id === currentStop ? ' active' : ''}`),
          )}
        </div>
      )}
    </aside>
  )
}
