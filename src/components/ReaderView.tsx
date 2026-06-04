import { type CSSProperties, useEffect, useState } from 'react'
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
  const revealed = useReader((s) => s.revealed)
  const currentSection = useReader((s) => s.currentSection)
  const sectionCount = useReader((s) => s.sections.length)
  const stepIndex = useReader((s) => s.stepIndex)
  const stepCount = useReader((s) => s.stepUnits.length)

  // Hold-to-advance state (filling progress shown on the edge cue).
  const [hold, setHold] = useState<{ dir: HoldDir; ticks: number }>({
    dir: null,
    ticks: 0,
  })
  // Whether the reading pane is at its top / bottom (for the cross hint).
  const [edge, setEdge] = useState({ top: false, bottom: false })

  useEffect(() => {
    enterReading()
  }, [enterReading])

  // Track scroll edges of the reading pane so we can show a "hold to cross"
  // hint the moment the user reaches the bottom (or top).
  useEffect(() => {
    if (mode !== 'section' || !revealed) {
      setEdge({ top: false, bottom: false })
      return
    }
    const el = sectionPane()
    if (!el) {
      setEdge({ top: false, bottom: false })
      return
    }
    const upd = () => setEdge({ top: atTop(el), bottom: atBottom(el) })
    upd()
    const t = setTimeout(upd, 60) // after layout settles
    el.addEventListener('scroll', upd)
    return () => {
      el.removeEventListener('scroll', upd)
      clearTimeout(t)
    }
  }, [mode, revealed, currentSection])

  useEffect(() => {
    let dir: HoldDir = null
    let ticks = 0
    // After a hold crosses into a new section, ignore the still-held key until
    // it's released so the new section doesn't instantly scroll/advance.
    let suppress = false
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
        suppress = true // wait for key release before acting again
        return
      }
      setHold({ dir, ticks })
    }

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      if (suppress && e.key.startsWith('Arrow')) {
        e.preventDefault()
        return
      }
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
      if (e.key.startsWith('Arrow')) {
        reset()
        suppress = false // key released — resume normal arrow handling
      }
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

  // Which boundary can be crossed right now (drives the persistent hint).
  const hasNext = currentSection < sectionCount - 1
  const hasPrev = currentSection > 0
  let cross: { dir: 'next' | 'prev'; axis: 'x' | 'y' } | null = null
  if (mode === 'section' && revealed) {
    if (edge.bottom && hasNext) cross = { dir: 'next', axis: 'y' }
    else if (edge.top && hasPrev) cross = { dir: 'prev', axis: 'y' }
  } else if (mode === 'stepping') {
    if (stepIndex >= stepCount - 1 && hasNext) cross = { dir: 'next', axis: 'x' }
    else if (stepIndex <= 0 && hasPrev) cross = { dir: 'prev', axis: 'x' }
  }
  const dir = hold.dir ?? cross?.dir ?? null
  const axis = cross?.axis ?? (mode === 'stepping' ? 'x' : 'y')
  const progress = hold.dir ? hold.ticks / HOLD_TICKS : 0
  const holding = hold.dir !== null
  const arrow =
    axis === 'x' ? (dir === 'next' ? '▶' : '◀') : dir === 'next' ? '▼' : '▲'
  const hintKey = axis === 'x' ? (dir === 'next' ? '→' : '←') : dir === 'next' ? '↓' : '↑'

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

      {(cross || holding) && dir && (
        <div className={`cross-cue ${dir} ${axis}`} aria-hidden="true">
          <div
            className={`cross-ring${holding ? ' holding' : ''}`}
            style={{ '--p': `${Math.round(progress * 100)}` } as CSSProperties}
          >
            <span className="cross-glyph">{arrow}</span>
          </div>
          <div className="cross-label">
            {holding ? 'keep holding' : `hold ${hintKey}`} · {dir} section
          </div>
        </div>
      )}
    </div>
  )
}
