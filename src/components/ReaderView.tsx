import { useEffect } from 'react'
import { useReader } from '../store/readerStore'
import Countdown from './Countdown'
import RsvpStage from './RsvpStage'
import SectionView from './SectionView'
import StepView from './StepView'
import './ReaderView.css'

const sectionPane = () => document.querySelector<HTMLElement>('.section-context')
const stepPane = () => document.querySelector<HTMLElement>('.step-scroll')

export default function ReaderView() {
  const mode = useReader((s) => s.mode)
  const enterReading = useReader((s) => s.enterReading)
  const beginRsvp = useReader((s) => s.beginRsvp)
  const fixateDeeper = useReader((s) => s.fixateDeeper)
  const stepNext = useReader((s) => s.stepNext)
  const stepPrev = useReader((s) => s.stepPrev)
  const rsvpSection = useReader((s) => s.rsvpSection)
  const nextSection = useReader((s) => s.nextSection)
  const prevSection = useReader((s) => s.prevSection)
  const gotoSectionRevealed = useReader((s) => s.gotoSectionRevealed)
  const toggleRsvp = useReader((s) => s.toggleRsvp)
  const goBack = useReader((s) => s.goBack)
  const exit = useReader((s) => s.exit)

  useEffect(() => {
    enterReading()
  }, [enterReading])

  const crossSection = (delta: 1 | -1) =>
    gotoSectionRevealed(useReader.getState().currentSection + delta)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      const s = useReader.getState()
      const meta = e.metaKey || e.ctrlKey

      // Cmd/Ctrl + arrow: jump to the next/prev section (reveal view).
      if (meta && e.key.startsWith('Arrow')) {
        e.preventDefault()
        if (e.repeat) return // one press = one section
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') crossSection(1)
        else crossSection(-1)
        return
      }

      switch (e.key) {
        case 'Enter':
          e.preventDefault()
          if (meta) rsvpSection()
          else if (e.shiftKey) stepPrev()
          else fixateDeeper()
          break
        case ' ':
          e.preventDefault()
          toggleRsvp()
          break
        case 'Escape':
          e.preventDefault()
          goBack()
          break

        case 'ArrowDown':
        case 'ArrowUp': {
          e.preventDefault()
          const down = e.key === 'ArrowDown'
          if (s.mode === 'section' && !s.revealed) {
            down ? nextSection() : prevSection() // heading list
          } else if (s.mode === 'section') {
            const el = sectionPane()
            if (el) el.scrollBy({ top: (down ? 1 : -1) * el.clientHeight * 0.45 })
          } else if (s.mode === 'stepping') {
            const el = stepPane()
            if (el) el.scrollBy({ top: (down ? 1 : -1) * el.clientHeight * 0.45 })
          }
          break
        }

        case 'ArrowRight':
        case 'ArrowLeft': {
          e.preventDefault()
          const fwd = e.key === 'ArrowRight'
          if (s.mode === 'stepping') {
            fwd ? stepNext() : stepPrev() // unit nav (clamps at ends)
          } else if (s.mode === 'section' && s.revealed) {
            const el = sectionPane()
            if (el) el.scrollBy({ left: (fwd ? 1 : -1) * el.clientWidth * 0.5 })
          }
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    fixateDeeper,
    stepNext,
    stepPrev,
    rsvpSection,
    nextSection,
    prevSection,
    gotoSectionRevealed,
    toggleRsvp,
    goBack,
  ])

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
