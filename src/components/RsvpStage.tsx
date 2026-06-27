import { useLayoutEffect, useRef } from 'react'
import { useReader } from '../store/readerStore'
import { chunkAt } from '../lib/chunk'
import { segmentText, splitPivot, stripWrappingSymbols } from '../lib/timing'
import type { SymbolMode } from '../lib/types'
import Reticle from './Reticle'
import WpmIndicator from './WpmIndicator'
import './RsvpStage.css'

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
      <WpmIndicator />
    </div>
  )
}
