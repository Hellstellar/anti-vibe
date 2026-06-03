import { useEffect } from 'react'
import { useReader } from '../store/readerStore'
import Countdown from './Countdown'
import RsvpStage from './RsvpStage'
import SectionView from './SectionView'
import StepView from './StepView'
import './ReaderView.css'

/** Scroll the active reading pane vertically (↑/↓). */
function scrollActive(dir: 1 | -1) {
  const el = document.querySelector<HTMLElement>('.section-context, .step-scroll')
  if (!el) return
  el.scrollBy({ top: dir * el.clientHeight * 0.45 })
}

export default function ReaderView() {
  const mode = useReader((s) => s.mode)
  const enterReading = useReader((s) => s.enterReading)
  const beginRsvp = useReader((s) => s.beginRsvp)
  const fixateDeeper = useReader((s) => s.fixateDeeper)
  const stepPrev = useReader((s) => s.stepPrev)
  const rsvpSection = useReader((s) => s.rsvpSection)
  const nextSection = useReader((s) => s.nextSection)
  const prevSection = useReader((s) => s.prevSection)
  const toggleRsvp = useReader((s) => s.toggleRsvp)
  const goBack = useReader((s) => s.goBack)
  const exit = useReader((s) => s.exit)

  // Open straight into the section reading view (the countdown runs before RSVP).
  useEffect(() => {
    enterReading()
  }, [enterReading])

  // All keyboard shortcuts live here (one generalised scheme).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return

      switch (e.key) {
        case 'Enter':
          e.preventDefault()
          if (e.metaKey || e.ctrlKey) rsvpSection() // RSVP from section start
          else if (e.shiftKey) stepPrev() // step backward
          else fixateDeeper() // reveal -> step -> next unit
          break
        case 'ArrowRight':
          e.preventDefault()
          nextSection()
          break
        case 'ArrowLeft':
          e.preventDefault()
          prevSection()
          break
        case 'ArrowDown':
          e.preventDefault()
          scrollActive(1)
          break
        case 'ArrowUp':
          e.preventDefault()
          scrollActive(-1)
          break
        case ' ':
          e.preventDefault()
          toggleRsvp() // pause / resume RSVP
          break
        case 'Escape':
          e.preventDefault()
          goBack() // up one level (never to landing)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fixateDeeper, stepPrev, rsvpSection, nextSection, prevSection, toggleRsvp, goBack])

  return (
    <div className="reader">
      <div className="crt-boot" aria-hidden="true" />
      <button className="exit-button" onClick={exit} title="Exit to landing">
        ✕
      </button>

      {mode === 'countdown' && <Countdown onDone={beginRsvp} />}
      {mode === 'playing' && <RsvpStage />}
      {mode === 'section' && <SectionView />}
      {mode === 'stepping' && <StepView />}
    </div>
  )
}
