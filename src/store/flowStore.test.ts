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
    expect(useFlow.getState().pendingBranch?.map((e) => e.to)).toEqual(['b', 'c'])
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

  it('map overlay opens, closes, and resets on load', () => {
    useFlow.getState().loadFlow(doc([stop('a', undefined, 1)]))
    useFlow.getState().openMap()
    expect(useFlow.getState().mapOpen).toBe(true)
    useFlow.getState().closeMap()
    expect(useFlow.getState().mapOpen).toBe(false)
    useFlow.getState().openMap()
    useFlow.getState().loadFlow(doc([stop('b', undefined, 1)]))
    expect(useFlow.getState().mapOpen).toBe(false)
  })

  it('gotoStop reaches a foundation stop off the graph', () => {
    useFlow
      .getState()
      .loadFlow(doc([stop('a', undefined, 1), stop('f', undefined, 1, 'foundation')]))
    useFlow.getState().gotoStop('f')
    expect(useFlow.getState().currentStop).toBe('f')
  })
})

describe('flowStore switcher list', () => {
  beforeEach(() => {
    useFlow.getState().exitFlow()
    useFlow.getState().setReviews([])
  })

  const meta = (documentId: string, createdAt: number, unread: boolean) => ({
    documentId,
    title: documentId,
    createdAt,
    kind: 'flow-review' as const,
    stopCount: 1,
    unread,
  })

  it('loadFlow lists the review as read (unread false)', () => {
    useFlow.getState().loadFlow(doc([stop('a', undefined, 1)]))
    const { reviews } = useFlow.getState()
    expect(reviews).toHaveLength(1)
    expect(reviews[0].documentId).toBe('d')
    expect(reviews[0].unread).toBe(false)
  })

  it('addReview upserts newest-first and dedupes by documentId', () => {
    const { addReview } = useFlow.getState()
    addReview(meta('older', 1, true))
    addReview(meta('newer', 2, true))
    addReview(meta('older', 3, false)) // re-push older with a newer timestamp
    const { reviews } = useFlow.getState()
    expect(reviews.map((r) => r.documentId)).toEqual(['older', 'newer'])
    expect(reviews[0].unread).toBe(false) // the upsert replaced the stale entry
  })

  it('loadFlow clears the unread flag of a previously-silent push', () => {
    useFlow.getState().addReview(meta('d', 5, true)) // arrived silently, unread
    useFlow.getState().loadFlow(doc([stop('a', undefined, 1)])) // documentId 'd'
    const entry = useFlow.getState().reviews.find((r) => r.documentId === 'd')
    expect(entry?.unread).toBe(false)
  })
})
