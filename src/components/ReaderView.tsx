import { useEffect, useState } from 'react'
import { useReader } from '../store/readerStore'
import Countdown from './Countdown'
import RsvpStage from './RsvpStage'
import SectionView from './SectionView'
import StepView from './StepView'
import './ReaderView.css'

const sectionPane = () => document.querySelector<HTMLElement>('.section-context')
const stepPane = () => document.querySelector<HTMLElement>('.step-code')
const atBottom = (el: HTMLElement) =>
  el.scrollTop + el.clientHeight >= el.scrollHeight - 8

export default function ReaderView() {
  const mode = useReader((s) => s.mode)
  const enterReading = useReader((s) => s.enterReading)
  const beginRsvp = useReader((s) => s.beginRsvp)
  const focusDeeper = useReader((s) => s.focusDeeper)
  const stepNext = useReader((s) => s.stepNext)
  const stepPrev = useReader((s) => s.stepPrev)
  const rsvpSection = useReader((s) => s.rsvpSection)
  const nextSection = useReader((s) => s.nextSection)
  const prevSection = useReader((s) => s.prevSection)
  const gotoSectionRevealed = useReader((s) => s.gotoSectionRevealed)
  const toggleRsvp = useReader((s) => s.toggleRsvp)
  const goBack = useReader((s) => s.goBack)
  const exit = useReader((s) => s.exit)
  const revealed = useReader((s) => s.revealed)
  const currentSection = useReader((s) => s.currentSection)
  const sectionCount = useReader((s) => s.sections.length)
  const stepIndex = useReader((s) => s.stepIndex)
  const stepCount = useReader((s) => s.stepUnits.length)

  // True once the current view is "done" — scrolled to the bottom of the
  // reading view, so the advance button can appear.
  const [readingDone, setReadingDone] = useState(false)

  useEffect(() => {
    enterReading()
  }, [enterReading])

  useEffect(() => {
    if (mode !== 'section' || !revealed) {
      setReadingDone(false)
      return
    }
    const el = sectionPane()
    if (!el) {
      setReadingDone(false)
      return
    }
    const upd = () => setReadingDone(atBottom(el))
    upd()
    const t = setTimeout(upd, 60)
    el.addEventListener('scroll', upd)
    return () => {
      el.removeEventListener('scroll', upd)
      clearTimeout(t)
    }
  }, [mode, revealed, currentSection])

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
          else focusDeeper()
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
    focusDeeper,
    stepNext,
    stepPrev,
    rsvpSection,
    nextSection,
    prevSection,
    gotoSectionRevealed,
    toggleRsvp,
    goBack,
  ])

  // Advance button: shown only once the section is "done" (reading scrolled to
  // the bottom, or the last step reached) and another section follows.
  const hasNext = currentSection < sectionCount - 1
  const done =
    (mode === 'section' && revealed && readingDone) ||
    (mode === 'stepping' && stepIndex >= stepCount - 1)
  const showAdvance = hasNext && done

  return (
    <div className="reader">
      <div className="screen-boot" aria-hidden="true" />
      <button className="exit-button" onClick={exit} title="Exit to landing">
        ✕
      </button>

      {mode === 'countdown' && <Countdown onDone={beginRsvp} />}
      {mode === 'playing' && <RsvpStage />}
      {mode === 'section' && <SectionView />}
      {mode === 'stepping' && <StepView />}

      {showAdvance && (
        <button
          className="advance-btn"
          title="Next section"
          onClick={() => crossSection(1)}
        >
          <span className="advance-icon">↓</span>
        </button>
      )}
    </div>
  )
}
