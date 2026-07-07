import { describe, expect, it } from 'vitest'
import { buildFlowGraph } from './flowGraph'
import { layoutFlow, NODE_H, NODE_W } from './flowLayout'
import type { ResolvedFlowStop } from './types'

function stop(id: string, callsTo: ResolvedFlowStop['callsTo'] = []): ResolvedFlowStop {
  return { id, callsTo, file: `${id}.ts`, layer: 'flow' } as ResolvedFlowStop
}

// login fans out to rate/audit, both fan back into handler (the shape that
// overlapped in the hand-rolled layout).
const FAN = [
  stop('login', [
    { to: 'rate', via: 'router.post' },
    { to: 'audit', via: 'withAudit' },
  ]),
  stop('rate', [{ to: 'handler', via: 'next' }]),
  stop('audit', [{ to: 'handler', via: 'log' }]),
  stop('handler'),
]
const FAN_ORDER = ['login', 'rate', 'audit', 'handler']

describe('layoutFlow', () => {
  it('positions every node with finite coordinates inside the canvas', () => {
    for (const dir of ['TB', 'LR'] as const) {
      const l = layoutFlow(buildFlowGraph(FAN, FAN_ORDER), dir)
      expect(l.nodes.size).toBe(4)
      for (const n of l.nodes.values()) {
        expect(Number.isFinite(n.x)).toBe(true)
        expect(Number.isFinite(n.y)).toBe(true)
        expect(n.x).toBeGreaterThanOrEqual(0)
        expect(n.y).toBeGreaterThanOrEqual(0)
        expect(n.x + NODE_W).toBeLessThanOrEqual(l.width)
        expect(n.y + NODE_H).toBeLessThanOrEqual(l.height)
      }
    }
  })

  it('routes every callsTo edge and carries its via label', () => {
    const l = layoutFlow(buildFlowGraph(FAN, FAN_ORDER), 'TB')
    expect(l.edges).toHaveLength(4)
    for (const e of l.edges) {
      expect(e.points.length).toBeGreaterThanOrEqual(2)
      expect(e.via).toBeTruthy()
      expect(e.label).toBeTruthy()
    }
  })

  it('separates sibling fan-out labels so they cannot overlap', () => {
    const l = layoutFlow(buildFlowGraph(FAN, FAN_ORDER), 'LR')
    const [a, b] = l.edges.filter((e) => e.from === 'login').map((e) => e.label!)
    const apart = Math.abs(a.x - b.x) > 8 || Math.abs(a.y - b.y) > 8
    expect(apart).toBe(true)
  })

  it('ranks callees after callers along the flow axis', () => {
    const graph = buildFlowGraph(FAN, FAN_ORDER)
    const lr = layoutFlow(graph, 'LR')
    const tb = layoutFlow(graph, 'TB')
    for (const [from, tos] of graph.callees) {
      for (const { to } of tos) {
        expect(lr.nodes.get(to)!.x).toBeGreaterThan(lr.nodes.get(from)!.x)
        expect(tb.nodes.get(to)!.y).toBeGreaterThan(tb.nodes.get(from)!.y)
      }
    }
  })

  it('survives cycles via the greedy acyclicer', () => {
    const cyc = [
      stop('a', [{ to: 'b', via: 'call' }]),
      stop('b', [{ to: 'a', via: 'back' }]),
    ]
    const l = layoutFlow(buildFlowGraph(cyc, ['a', 'b']), 'TB')
    expect(l.nodes.size).toBe(2)
    expect(l.edges).toHaveLength(2)
  })
})
