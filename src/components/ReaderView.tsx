import { useEffect } from 'react'
import { useReader } from '../store/readerStore'
import Countdown from './Countdown'
import RsvpStage from './RsvpStage'
import SectionView from './SectionView'
import StepView from './StepView'
import './ReaderView.css'

export default function ReaderView() {
  const mode = useReader((s) => s.mode)
  const enterReading = useReader((s) => s.enterReading)
  const beginRsvp = useReader((s) => s.beginRsvp)
  const enterKey = useReader((s) => s.enterKey)
  const prevSection = useReader((s) => s.prevSection)
  const toggleRsvp = useReader((s) => s.toggleRsvp)
  const startStepping = useReader((s) => s.startStepping)
  const stepNext = useReader((s) => s.stepNext)
  const stepPrev = useReader((s) => s.stepPrev)
  const goBack = useReader((s) => s.goBack)
  const exit = useReader((s) => s.exit)

  // Open straight into the section reading view (the countdown now runs
  // before RSVP, not at startup).
  useEffect(() => {
    enterReading()
  }, [enterReading])

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return

      const stepping = useReader.getState().mode === 'stepping'
      const revealed = useReader.getState().revealed

      switch (e.key) {
        case ' ':
          if (stepping) {
            e.preventDefault()
            stepNext()
          } else {
            e.preventDefault()
            toggleRsvp()
          }
          break
        case 'Enter':
          e.preventDefault()
          if (e.shiftKey) {
            stepping ? stepPrev() : prevSection()
          } else if ((e.metaKey || e.ctrlKey) && !stepping && revealed) {
            startStepping() // Cmd/Ctrl+Enter -> step through this section
          } else if (stepping) {
            stepNext()
          } else {
            enterKey()
          }
          break
        case 'Escape':
          e.preventDefault()
          goBack() // back key: stepping/RSVP -> section -> heading -> exit
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleRsvp, enterKey, prevSection, startStepping, stepNext, stepPrev, goBack])

  return (
    <div className="reader">
      {/* one-shot CRT power-on flash when the reader (document) opens */}
      <div className="crt-boot" aria-hidden="true" />
      <button className="exit-button" onClick={exit} title="Exit">
        ✕
      </button>

      {mode === 'countdown' && <Countdown onDone={beginRsvp} />}
      {mode === 'playing' && <RsvpStage />}
      {mode === 'section' && <SectionView />}
      {mode === 'stepping' && <StepView />}
    </div>
  )
}
