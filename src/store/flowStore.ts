import { create } from 'zustand'
import { buildFlowGraph, type FlowGraph } from '../lib/flowGraph'
import type { FlowReviewDoc, ResolvedFlowStop, ReviewMeta } from '../lib/types'

/**
 * State for Flow Review mode: a flow-ordered code review walked like a sequence
 * diagram. Navigation follows the `callsTo` call graph (see lib/flowGraph) —
 * caller→callee, branching, multiple entry points — with a history stack for
 * "back". Hunks are stepped within a stop; passing the last hunk advances along
 * the graph. Separate from the markdown reader store (only one is populated per
 * pushed doc, routed by `doc.kind`). No playback loop — review reads, not speed-reads.
 */
interface FlowState {
  documentId: string
  title: string
  stops: ResolvedFlowStop[]
  flowOrder: string[]
  foundationOrder: string[]
  graph: FlowGraph
  /** Id of the stop in focus, or null when no review is loaded. */
  currentStop: string | null
  /** Index of the hunk in focus within the current stop's file. */
  hunkIndex: number
  /** Nav breadcrumb, enabling "back" to where you actually came from. */
  history: string[]
  /** Callee ids awaiting a branch choice (set when a stop calls several). */
  pendingBranch: string[] | null
  /** Minimal, distraction-free single-hunk mode (minimap + chrome hidden). */
  focusMode: boolean
  /** All persisted flow reviews (metadata) for the switcher, newest first. */
  reviews: ReviewMeta[]

  /** Replace the switcher's review list (from the bridge's /docs endpoint). */
  setReviews: (reviews: ReviewMeta[]) => void
  loadFlow: (doc: FlowReviewDoc) => void
  exitFlow: () => void
  /** Jump directly to a stop (minimap / branch pick / foundation). Records history. */
  gotoStop: (id: string) => void
  /** Advance one hunk; at the file's end follows the call graph (may branch). */
  nextHunk: () => void
  /** Back one hunk; at the file's start pops history to the previous stop. */
  prevHunk: () => void
  /** Resolve a pending branch choice. */
  chooseBranch: (id: string) => void
  cancelBranch: () => void
  /** Esc: pop history to the previous stop (or cancel a pending branch). */
  back: () => void
  enterFocus: () => void
  exitFocus: () => void
}

const EMPTY_GRAPH: FlowGraph = {
  order: [],
  callees: new Map(),
  callers: new Map(),
  depth: new Map(),
  roots: [],
}

const EMPTY = {
  documentId: '',
  title: '',
  stops: [] as ResolvedFlowStop[],
  flowOrder: [] as string[],
  foundationOrder: [] as string[],
  graph: EMPTY_GRAPH,
  currentStop: null as string | null,
  hunkIndex: 0,
  history: [] as string[],
  pendingBranch: null as string[] | null,
  focusMode: false,
}

export const useFlow = create<FlowState>((set, get) => {
  const stopById = (id: string | null) => get().stops.find((s) => s.id === id)
  const hunkCount = (id: string | null) => stopById(id)?.hunks.length ?? 0

  /** Move to `id`, pushing the current stop onto history. `land` picks the hunk. */
  const goTo = (id: string, land: 'first' | 'last', pushHistory = true) => {
    const { currentStop, history } = get()
    const nextHistory =
      pushHistory && currentStop && currentStop !== id ? [...history, currentStop] : history
    set({
      currentStop: id,
      hunkIndex: land === 'last' ? Math.max(0, hunkCount(id) - 1) : 0,
      history: nextHistory,
      pendingBranch: null,
    })
  }

  /** Advance along the call graph from the current stop. */
  const advance = () => {
    const { graph, currentStop } = get()
    if (!currentStop) return
    const callees = graph.callees.get(currentStop) ?? []
    if (callees.length === 1) {
      goTo(callees[0], 'first')
    } else if (callees.length > 1) {
      set({ pendingBranch: callees }) // let the user choose
    } else {
      // Leaf: jump to the next unvisited entry root, else clamp.
      const visited = new Set([...get().history, currentStop])
      const nextRoot = graph.roots.find((r) => !visited.has(r))
      if (nextRoot) goTo(nextRoot, 'first')
    }
  }

  return {
    ...EMPTY,
    reviews: [], // NOT in EMPTY — the switcher list survives exit/reload

    setReviews: (reviews) => set({ reviews }),

    loadFlow: (doc) => {
      const flowOrder = doc.stops.filter((s) => s.layer === 'flow').map((s) => s.id)
      const foundationOrder = doc.stops
        .filter((s) => s.layer === 'foundation')
        .map((s) => s.id)
      const graph = buildFlowGraph(doc.stops, flowOrder)
      // Start at the first entry point (topo order), else the first stop.
      const start = graph.roots[0] ?? graph.order[0] ?? doc.stops[0]?.id ?? null
      // Upsert this review into the switcher list (fresh pushes may not be in it yet).
      const meta: ReviewMeta = {
        documentId: doc.documentId,
        title: doc.title,
        createdAt: doc.createdAt,
        kind: 'flow-review',
        stopCount: doc.stops.length,
      }
      const reviews = [meta, ...get().reviews.filter((r) => r.documentId !== doc.documentId)].sort(
        (a, b) => b.createdAt - a.createdAt,
      )
      set({
        ...EMPTY,
        documentId: doc.documentId,
        title: doc.title,
        stops: doc.stops,
        flowOrder,
        foundationOrder,
        graph,
        currentStop: start,
        reviews,
      })
    },

    exitFlow: () => set({ ...EMPTY }),

    gotoStop: (id) => {
      if (get().stops.some((s) => s.id === id)) goTo(id, 'first')
    },

    nextHunk: () => {
      const { hunkIndex, currentStop, pendingBranch } = get()
      if (pendingBranch) return // waiting on a branch choice
      if (hunkIndex < hunkCount(currentStop) - 1) set({ hunkIndex: hunkIndex + 1 })
      else advance()
    },

    prevHunk: () => {
      const { hunkIndex, history } = get()
      if (get().pendingBranch) {
        set({ pendingBranch: null })
        return
      }
      if (hunkIndex > 0) {
        set({ hunkIndex: hunkIndex - 1 })
        return
      }
      if (history.length) {
        const prev = history[history.length - 1]
        set({
          currentStop: prev,
          hunkIndex: Math.max(0, hunkCount(prev) - 1),
          history: history.slice(0, -1),
        })
      }
    },

    chooseBranch: (id) => {
      if (get().stops.some((s) => s.id === id)) goTo(id, 'first')
    },
    cancelBranch: () => set({ pendingBranch: null }),

    back: () => {
      const { pendingBranch, history } = get()
      if (pendingBranch) {
        set({ pendingBranch: null })
        return
      }
      if (history.length) {
        const prev = history[history.length - 1]
        set({ currentStop: prev, hunkIndex: 0, history: history.slice(0, -1) })
      }
    },

    enterFocus: () => set({ focusMode: true }),
    exitFocus: () => set({ focusMode: false }),
  }
})
