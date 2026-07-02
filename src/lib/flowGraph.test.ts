import { describe, it, expect } from 'vitest'
import { buildFlowGraph } from './flowGraph'
import type { FlowCall, ResolvedFlowStop } from './types'

const stop = (id: string, callsTo?: FlowCall[]): ResolvedFlowStop => ({
  id,
  file: `${id}.ts`,
  layer: 'flow',
  title: id,
  explanation: '',
  oneLineSummary: '',
  callsTo,
  hunks: [],
  matchStatus: 'exact',
})

describe('buildFlowGraph', () => {
  it('derives callees, callers, roots and a topo order', () => {
    // a -> b -> c ;  a -> c
    const stops = [stop('a', ['b', 'c']), stop('b', ['c']), stop('c')]
    const g = buildFlowGraph(stops, ['a', 'b', 'c'])
    expect(g.roots).toEqual(['a'])
    expect(g.callees.get('a')).toEqual([{ to: 'b', via: undefined }, { to: 'c', via: undefined }])
    expect(g.callers.get('c')!.sort()).toEqual(['a', 'b'])
    // a before b before c
    expect(g.order.indexOf('a')).toBeLessThan(g.order.indexOf('b'))
    expect(g.order.indexOf('b')).toBeLessThan(g.order.indexOf('c'))
  })

  it('supports multiple entry points', () => {
    const stops = [stop('x', ['z']), stop('y', ['z']), stop('z')]
    const g = buildFlowGraph(stops, ['x', 'y', 'z'])
    expect(g.roots.sort()).toEqual(['x', 'y'])
  })

  it('ignores edges to unknown / foundation ids and self-loops', () => {
    const stops = [stop('a', ['a', 'ghost', 'b']), stop('b')]
    const g = buildFlowGraph(stops, ['a', 'b'])
    expect(g.callees.get('a')).toEqual([{ to: 'b', via: undefined }])
  })

  it('carries via labels and de-dupes repeat edges (first label wins)', () => {
    const stops = [stop('a', [{ to: 'b', via: 'handleSubmit' }, 'b', { to: 'c' }]), stop('b'), stop('c')]
    const g = buildFlowGraph(stops, ['a', 'b', 'c'])
    expect(g.callees.get('a')).toEqual([
      { to: 'b', via: 'handleSubmit' },
      { to: 'c', via: undefined },
    ])
    // A bare edge followed by a labeled duplicate adopts the label.
    const g2 = buildFlowGraph([stop('a', ['b', { to: 'b', via: 'later' }]), stop('b')], ['a', 'b'])
    expect(g2.callees.get('a')).toEqual([{ to: 'b', via: 'later' }])
  })

  it('does not hang on cycles (all nodes still ordered)', () => {
    const stops = [stop('a', ['b']), stop('b', ['a'])]
    const g = buildFlowGraph(stops, ['a', 'b'])
    expect(g.order.sort()).toEqual(['a', 'b'])
  })
})
