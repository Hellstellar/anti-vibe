import { useLayoutEffect, useRef } from 'react'
import { useReader } from '../store/readerStore'
import { chunkAt } from '../lib/chunk'
import { segmentText, splitPivot, stripWrappingSymbols } from '../lib/timing'
import type { Section, SymbolMode, Token, WordToken } from '../lib/types'
import Reticle from './Reticle'
import WpmIndicator from './WpmIndicator'
import './RsvpStage.css'

const PREVIEW_SPAN = 6

/** Word tokens within `span` either side of `currentIndex`, bounded to the
 *  current section and stopping at an atomic (RSVP never plays across one). */
function nearbyWords(tokens: Token[], currentIndex: number, sec: Section, span: number) {
  const before: WordToken[] = []
  for (let i = currentIndex - 1; i >= sec.tokenStart && before.length < span; i--) {
    const t = tokens[i]
    if (t.kind === 'atomic') break
    before.unshift(t)
  }
  const after: WordToken[] = []
  for (let i = currentIndex + 1; i <= sec.tokenEnd && after.length < span; i++) {
    const t = tokens[i]
    if (t.kind === 'atomic') break
    after.push(t)
  }
  return { before, after }
}

/** Scrub strip shown only while RSVP is paused — surrounding words for
 *  context, click one (or the ‹ › nudge buttons) to rewind/advance the frozen
 *  cursor before resuming. */
function RsvpPreview() {
  const tokens = useReader((s) => s.tokens)
  const currentIndex = useReader((s) => s.currentIndex)
  const sections = useReader((s) => s.sections)
  const currentSection = useReader((s) => s.currentSection)
  const rsvpNudge = useReader((s) => s.rsvpNudge)
  const rsvpSeek = useReader((s) => s.rsvpSeek)

  const sec = sections[currentSection]
  const current = tokens[currentIndex]
  if (!sec || !current || current.kind !== 'word') return null
  const { before, after } = nearbyWords(tokens, currentIndex, sec, PREVIEW_SPAN)

  return (
    <div className="rsvp-preview">
      <button
        className="rsvp-scrub-btn"
        onClick={() => rsvpNudge(-1)}
        disabled={before.length === 0}
        title="Back one word"
      >
        ‹
      </button>
      <div className="rsvp-preview-strip">
        {before.map((w) => (
          <span key={w.index} className="rp-word" onClick={() => rsvpSeek(w.index)}>
            {w.text}
          </span>
        ))}
        <span className="rp-word rp-current">{current.text}</span>
        {after.map((w) => (
          <span key={w.index} className="rp-word" onClick={() => rsvpSeek(w.index)}>
            {w.text}
          </span>
        ))}
      </div>
      <button
        className="rsvp-scrub-btn"
        onClick={() => rsvpNudge(1)}
        disabled={after.length === 0}
        title="Forward one word"
      >
        ›
      </button>
    </div>
  )
}

/** One side of the flashed word (pre/post). In 'dim' mode symbol runs are
 *  recessed via .rsvp-sym; otherwise the text renders verbatim. */
function SymbolText({ text, dim }: { text: string; dim: boolean }) {
  if (!dim || !text) return <>{text}</>
  return (
    <>
      {segmentText(text).map((seg, i) =>
        seg.sym ? (
          <span key={i} className="rsvp-sym">
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  )
}

/** Apply the symbol mode to the chunk text before it's split for the pivot. */
function displayText(text: string, symbols: SymbolMode): string {
  return symbols === 'strip' ? stripWrappingSymbols(text) : text
}

export default function RsvpStage() {
  const tokens = useReader((s) => s.tokens)
  const currentIndex = useReader((s) => s.currentIndex)
  const chunkSize = useReader((s) => s.cfg.chunkSize)
  const symbols = useReader((s) => s.cfg.symbols)
  const paused = useReader((s) => s.paused)

  const wordRef = useRef<HTMLDivElement>(null)
  const pivotRef = useRef<HTMLSpanElement>(null)

  const chunk = chunkAt(tokens, currentIndex, chunkSize)
  // A solo inline-code span is shown whole, held longer, as a monospace frame.
  const isCode = chunk?.words.length === 1 && chunk.words[0].code
  const text = chunk && !isCode ? displayText(chunk.text, symbols) : ''
  const { pre, pivot, post } = splitPivot(text)

  // Measure-and-translate: shift the word so the pivot letter lands on the
  // fixed screen-center reticle. Font-agnostic (supports custom fonts). No-op
  // for the code hold frame (no pivot span to pin).
  useLayoutEffect(() => {
    const word = wordRef.current
    const piv = pivotRef.current
    if (!word || !piv) return
    word.style.transform = 'translateX(0px)'
    const pivotCenter = piv.getBoundingClientRect()
    const pivotCenterX = pivotCenter.left + pivotCenter.width / 2
    const target = window.innerWidth / 2
    const dx = target - pivotCenterX
    word.style.transform = `translateX(${dx}px)`
  }, [text])

  if (!chunk) return null

  if (isCode) {
    return (
      <div className="rsvp-stage">
        <Reticle />
        <div className="rsvp-band">
          <code key={chunk.start} className="rsvp-code">
            {chunk.words[0].text}
          </code>
        </div>
        {paused && <RsvpPreview />}
        <WpmIndicator />
      </div>
    )
  }

  const dim = symbols === 'dim'
  const emphasis = chunk.words[0]?.emphasis ?? []
  const listItemStart = chunk.words[0]?.listItemStart ?? false
  const cls = [
    'rsvp-word',
    emphasis.includes('strong') ? 'is-strong' : '',
    emphasis.includes('em') ? 'is-em' : '',
    chunk.listItem ? 'is-list' : '',
    listItemStart ? 'is-list-start' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="rsvp-stage">
      <Reticle />
      <div className="rsvp-band">
        {/* key forces the flash animation to retrigger each chunk */}
        <div key={chunk.start} ref={wordRef} className={cls}>
          {chunk.listItem && <span className="rsvp-bullet">▸ </span>}
          <span className="rsvp-pre">
            <SymbolText text={pre} dim={dim} />
          </span>
          <span ref={pivotRef} className="rsvp-pivot">
            {pivot}
          </span>
          <span className="rsvp-post">
            <SymbolText text={post} dim={dim} />
          </span>
        </div>
      </div>
      {paused && <RsvpPreview />}
      <WpmIndicator />
    </div>
  )
}
