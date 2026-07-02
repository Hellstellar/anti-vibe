import { useEffect } from 'react'
import { useFlow } from '../store/flowStore'
import FlowStop from './FlowStop'
import SequenceMinimap from './SequenceMinimap'
import BranchPicker from './BranchPicker'
import './FlowReviewView.css'

export default function FlowReviewView() {
  const stops = useFlow((s) => s.stops)
  const flowOrder = useFlow((s) => s.flowOrder)
  const foundationOrder = useFlow((s) => s.foundationOrder)
  const graph = useFlow((s) => s.graph)
  const currentStop = useFlow((s) => s.currentStop)
  const hunkIndex = useFlow((s) => s.hunkIndex)
  const focusMode = useFlow((s) => s.focusMode)
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
            chooseBranch(pick)
          }
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
        case 'Escape':
          e.preventDefault()
          if (s.focusMode) exitFocus()
          else back() // jump a whole stop back along history
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nextHunk, prevHunk, back, enterFocus, exitFocus, chooseBranch, cancelBranch])

  const stop = stops.find((s) => s.id === currentStop) ?? null
  const spinePos = currentStop ? graph.order.indexOf(currentStop) : -1
  const branchStops = (pendingBranch ?? [])
    .map((id) => stops.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)

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
        <SequenceMinimap
          stops={stops}
          graph={graph}
          foundationOrder={foundationOrder}
          currentStop={currentStop}
          history={useFlow.getState().history}
          onPick={gotoStop}
        />
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
              .map((id) => stops.find((s) => s.id === id))
              .filter((s): s is NonNullable<typeof s> => !!s)}
            onNextHunk={nextHunk}
            onPrevHunk={prevHunk}
            onEnterFocus={enterFocus}
            onGotoStop={gotoStop}
          />
        ) : (
          <div className="fr-empty">No stop selected.</div>
        )}
      </main>

      {branchStops.length > 0 && (
        <BranchPicker stops={branchStops} onPick={chooseBranch} onCancel={cancelBranch} />
      )}
    </div>
  )
}
