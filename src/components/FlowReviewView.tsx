import { useEffect } from 'react'
import { normalizeCall } from '../lib/flowGraph'
import type { ResolvedFlowStop } from '../lib/types'
import { useFlow } from '../store/flowStore'
import FlowStop from './FlowStop'
import FlowMapOverlay from './FlowMapOverlay'
import SequenceMinimap from './SequenceMinimap'
import ReviewSwitcher from './ReviewSwitcher'
import BranchPicker from './BranchPicker'
import './FlowReviewView.css'

/** A call edge with its callee resolved to the actual stop. */
type CallRef = { stop: ResolvedFlowStop; via: string | undefined }

export default function FlowReviewView() {
  const stops = useFlow((s) => s.stops)
  const flowOrder = useFlow((s) => s.flowOrder)
  const foundationOrder = useFlow((s) => s.foundationOrder)
  const graph = useFlow((s) => s.graph)
  const currentStop = useFlow((s) => s.currentStop)
  const hunkIndex = useFlow((s) => s.hunkIndex)
  const focusMode = useFlow((s) => s.focusMode)
  const mapOpen = useFlow((s) => s.mapOpen)
  const history = useFlow((s) => s.history)
  const pendingBranch = useFlow((s) => s.pendingBranch)
  const title = useFlow((s) => s.title)
  const gotoStop = useFlow((s) => s.gotoStop)
  const nextHunk = useFlow((s) => s.nextHunk)
  const prevHunk = useFlow((s) => s.prevHunk)
  const back = useFlow((s) => s.back)
  const chooseBranch = useFlow((s) => s.chooseBranch)
  const cancelBranch = useFlow((s) => s.cancelBranch)
  const enterFocus = useFlow((s) => s.enterFocus)
  const exitFocus = useFlow((s) => s.exitFocus)
  const openMap = useFlow((s) => s.openMap)
  const closeMap = useFlow((s) => s.closeMap)
  const exitFlow = useFlow((s) => s.exitFlow)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      const s = useFlow.getState()
      // While a branch is pending, digits 1-9 pick, Esc cancels.
      if (s.pendingBranch) {
        if (e.key === 'Escape') {
          e.preventDefault()
          cancelBranch()
        } else if (/^[1-9]$/.test(e.key)) {
          const pick = s.pendingBranch[Number(e.key) - 1]
          if (pick) {
            e.preventDefault()
            chooseBranch(pick.to)
          }
        }
        return
      }
      // While the map overlay is open it owns the keyboard: esc/m close it,
      // everything else is ignored so the review doesn't move underneath.
      if (s.mapOpen) {
        if (e.key === 'Escape' || e.key === 'm') {
          e.preventDefault()
          closeMap()
        }
        return
      }
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
        case 'j':
          e.preventDefault()
          nextHunk() // hunks inner; follows the call graph at the file's end
          break
        case 'ArrowUp':
        case 'ArrowLeft':
        case 'k':
          e.preventDefault()
          prevHunk()
          break
        case 'Enter':
          e.preventDefault()
          if (!s.focusMode) enterFocus()
          break
        case 'm':
          e.preventDefault()
          openMap()
          break
        case 'Escape':
          e.preventDefault()
          if (s.focusMode) exitFocus()
          else back() // jump a whole stop back along history
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nextHunk, prevHunk, back, enterFocus, exitFocus, openMap, closeMap, chooseBranch, cancelBranch])

  const stop = stops.find((s) => s.id === currentStop) ?? null
  const spinePos = currentStop ? graph.order.indexOf(currentStop) : -1
  const branchOptions = (pendingBranch ?? [])
    .map((edge) => ({ stop: stops.find((s) => s.id === edge.to), via: edge.via }))
    .filter((o): o is CallRef => !!o.stop)

  return (
    <div className={`flow-review${focusMode ? ' focus' : ''}`}>
      <div className="screen-boot" aria-hidden="true" />
      <button
        className="exit-button"
        onClick={focusMode ? exitFocus : exitFlow}
        title={focusMode ? 'Exit focus' : 'Exit review'}
      >
        ✕
      </button>

      {!focusMode && (
        <div className="fr-left">
          <ReviewSwitcher />
          <SequenceMinimap
            stops={stops}
            graph={graph}
            foundationOrder={foundationOrder}
            currentStop={currentStop}
            onPick={gotoStop}
            onOpenMap={openMap}
          />
        </div>
      )}

      <main className="fr-stage">
        {!focusMode && title && <div className="fr-doc-title">{title}</div>}
        {stop ? (
          <FlowStop
            stop={stop}
            position={spinePos}
            total={flowOrder.length}
            hunkIndex={hunkIndex}
            minimal={focusMode}
            calls={(stop.callsTo ?? [])
              .map(normalizeCall)
              .map((edge) => ({ stop: stops.find((s) => s.id === edge.to), via: edge.via }))
              .filter((c): c is CallRef => !!c.stop)}
            onNextHunk={nextHunk}
            onPrevHunk={prevHunk}
            onEnterFocus={enterFocus}
            onGotoStop={gotoStop}
          />
        ) : (
          <div className="fr-empty">No stop selected.</div>
        )}
      </main>

      {branchOptions.length > 0 && (
        <BranchPicker options={branchOptions} onPick={chooseBranch} onCancel={cancelBranch} />
      )}

      {mapOpen && (
        <FlowMapOverlay
          stops={stops}
          graph={graph}
          foundationOrder={foundationOrder}
          currentStop={currentStop}
          history={history}
          onPick={(id) => {
            gotoStop(id)
            closeMap()
          }}
          onClose={closeMap}
        />
      )}
    </div>
  )
}
