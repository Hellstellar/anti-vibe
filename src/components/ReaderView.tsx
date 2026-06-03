import { useEffect, useState } from 'react'
import { useReader } from '../store/readerStore'
import Countdown from './Countdown'
import RsvpStage from './RsvpStage'
import SectionView from './SectionView'
import StepView from './StepView'
import './ReaderView.css'

const HOLD_TICKS = 10 // key-repeats needed to advance to the next/prev section

type HoldDir = 'next' | 'prev' | null

const sectionPane = () => document.querySelector<HTMLElement>('.section-context')
const stepPane = () => document.querySelector<HTMLElement>('.step-scroll')
const atBottom = (el: HTMLElement) =>
  el.scrollTop + el.clientHeight >= el.scrollHeight - 8
const atTop = (el: HTMLElement) => el.scrollTop <= 2

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

  // Hold-to-advance state (filling progress shown on the edge cue).
  const [hold, setHold] = useState<{ dir: HoldDir; ticks: number }>({
    dir: null,
    ticks: 0,
  })

  useEffect(() => {
    enterReading()
  }, [enterReading])

  useEffect(() => {
    let dir: HoldDir = null
    let ticks = 0
    const reset = () => {
      dir = null
      ticks = 0
      setHold({ dir: null, ticks: 0 })
    }
    // Accumulate a hold toward advancing a section; fire at the threshold.
    const tick = (d: HoldDir) => {
      if (dir !== d) {
        dir = d
        ticks = 1
      } else {
        ticks++
      }
      if (ticks >= HOLD_TICKS) {
        const { currentSection } = useReader.getState()
        gotoSectionRevealed(currentSection + (d === 'next' ? 1 : -1))
        reset()
        return
      }
      setHold({ dir, ticks })
    }

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      const s = useReader.getState()

      switch (e.key) {
        case 'Enter':
          e.preventDefault()
          if (e.metaKey || e.ctrlKey) rsvpSection()
          else if (e.shiftKey) stepPrev()
          else fixateDeeper()
          break
        case ' ':
          e.preventDefault()
          toggleRsvp()
          break
        case 'Escape':
          e.preventDefault()
          reset()
          goBack()
          break

        case 'ArrowDown':
        case 'ArrowUp': {
          e.preventDefault()
          const down = e.key === 'ArrowDown'
          if (s.mode === 'section' && !s.revealed) {
            // heading view: navigate headings
            if (down) nextSection()
            else prevSection()
            reset()
          } else if (s.mode === 'section') {
            const el = sectionPane()
            if (!el) break
            const edge = down ? atBottom(el) : atTop(el)
            if (!edge) {
              el.scrollBy({ top: (down ? 1 : -1) * el.clientHeight * 0.45 })
              reset()
            } else {
              tick(down ? 'next' : 'prev')
            }
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
            const last = s.stepIndex >= s.stepUnits.length - 1
            const first = s.stepIndex <= 0
            if (fwd && !last) {
              stepNext()
              reset()
            } else if (!fwd && !first) {
              stepPrev()
              reset()
            } else {
              tick(fwd ? 'next' : 'prev') // at a boundary -> hold to change section
            }
          } else if (s.mode === 'section' && s.revealed) {
            // horizontal scroll (wide tables/code); never jumps sections
            const el = sectionPane()
            if (el) el.scrollBy({ left: (fwd ? 1 : -1) * el.clientWidth * 0.5 })
          }
          break
        }
      }
    }

    const onUp = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow')) reset()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
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

  const progress = hold.dir ? hold.ticks / HOLD_TICKS : 0
  const holdAxis = mode === 'stepping' ? 'x' : 'y'

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

      {hold.dir && (
        <div className={`hold-cue ${hold.dir} ${holdAxis}`} aria-hidden="true">
          <div className="hold-arrow">
            {holdAxis === 'x' ? (hold.dir === 'next' ? '▶' : '◀') : hold.dir === 'next' ? '▼' : '▲'}
          </div>
          <div className="hold-bar">
            <div className="hold-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="hold-label">hold · {hold.dir} section</div>
        </div>
      )}
    </div>
  )
}
