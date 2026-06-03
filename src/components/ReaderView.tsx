import { useEffect } from 'react'
import { useReader } from '../store/readerStore'
import Countdown from './Countdown'
import RsvpStage from './RsvpStage'
import SectionView from './SectionView'
import StepView from './StepView'
import './ReaderView.css'

export default function ReaderView() {
  const mode = useReader((s) => s.mode)
  const startCountdown = useReader((s) => s.startCountdown)
  const enterReading = useReader((s) => s.enterReading)
  const enterKey = useReader((s) => s.enterKey)
  const prevSection = useReader((s) => s.prevSection)
  const toggleRsvp = useReader((s) => s.toggleRsvp)
  const startStepping = useReader((s) => s.startStepping)
  const stepNext = useReader((s) => s.stepNext)
  const stepPrev = useReader((s) => s.stepPrev)
  const goBack = useReader((s) => s.goBack)
  const exit = useReader((s) => s.exit)

  // Auto-start the countdown when the reader first opens.
  useEffect(() => {
    startCountdown()
  }, [startCountdown])

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
      <button className="exit-button" onClick={exit} title="Exit">
        ✕
      </button>

      {mode === 'countdown' && <Countdown onDone={enterReading} />}
      {mode === 'playing' && <RsvpStage />}
      {mode === 'section' && <SectionView />}
      {mode === 'stepping' && <StepView />}
    </div>
  )
}
