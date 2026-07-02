import { describe, it, expect, beforeEach } from 'vitest'
import { useFlow } from './flowStore'
import type { FlowReviewDoc, ResolvedFlowStop } from '../lib/types'

const stop = (
  id: string,
  callsTo: string[] | undefined,
  hunkCount: number,
  layer: 'flow' | 'foundation' = 'flow',
): ResolvedFlowStop => ({
  id,
  file: `${id}.ts`,
  layer,
  title: id,
  explanation: '',
  oneLineSummary: '',
  callsTo,
  matchStatus: 'exact',
  hunks: Array.from({ length: hunkCount }, (_, i) => ({
    header: `@@ ${i} @@`,
    diffText: `line ${i}`,
    line: i + 1,
  })),
})

const doc = (stops: ResolvedFlowStop[]): FlowReviewDoc => ({
  kind: 'flow-review',
  documentId: 'd',
  title: 't',
  createdAt: 0,
  stops,
})

describe('flowStore navigation', () => {
  beforeEach(() => useFlow.getState().exitFlow())

  it('starts at the entry root', () => {
    useFlow.getState().loadFlow(doc([stop('a', ['b'], 1), stop('b', undefined, 1)]))
    expect(useFlow.getState().currentStop).toBe('a')
  })

  it('steps hunks then follows a single callee', () => {
    useFlow.getState().loadFlow(doc([stop('a', ['b'], 2), stop('b', undefined, 1)]))
    const { nextHunk } = useFlow.getState()
    nextHunk() // hunk 0 -> 1
    expect(useFlow.getState().hunkIndex).toBe(1)
    nextHunk() // past last hunk -> callee b
    expect(useFlow.getState().currentStop).toBe('b')
    expect(useFlow.getState().hunkIndex).toBe(0)
  })

  it('opens a branch when a stop calls several, and resolves it', () => {
    useFlow
      .getState()
      .loadFlow(doc([stop('a', ['b', 'c'], 1), stop('b', undefined, 1), stop('c', undefined, 1)]))
    useFlow.getState().nextHunk() // past a's single hunk -> branch
    expect(useFlow.getState().pendingBranch).toEqual(['b', 'c'])
    expect(useFlow.getState().currentStop).toBe('a') // stays until chosen
    useFlow.getState().chooseBranch('c')
    expect(useFlow.getState().pendingBranch).toBeNull()
    expect(useFlow.getState().currentStop).toBe('c')
  })

  it('back pops history to the previous stop', () => {
    useFlow.getState().loadFlow(doc([stop('a', ['b'], 1), stop('b', undefined, 1)]))
    useFlow.getState().nextHunk() // a -> b (records history)
    expect(useFlow.getState().currentStop).toBe('b')
    useFlow.getState().back()
    expect(useFlow.getState().currentStop).toBe('a')
  })

  it('gotoStop reaches a foundation stop off the graph', () => {
    useFlow
      .getState()
      .loadFlow(doc([stop('a', undefined, 1), stop('f', undefined, 1, 'foundation')]))
    useFlow.getState().gotoStop('f')
    expect(useFlow.getState().currentStop).toBe('f')
  })
})
