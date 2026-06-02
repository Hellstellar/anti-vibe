import { useLayoutEffect, useRef } from 'react'
import { useReader } from '../store/readerStore'
import { chunkAt } from '../lib/chunk'
import { splitPivot } from '../lib/timing'
import Reticle from './Reticle'
import WpmIndicator from './WpmIndicator'
import './RsvpStage.css'

export default function RsvpStage() {
  const tokens = useReader((s) => s.tokens)
  const currentIndex = useReader((s) => s.currentIndex)
  const chunkSize = useReader((s) => s.cfg.chunkSize)

  const wordRef = useRef<HTMLDivElement>(null)
  const pivotRef = useRef<HTMLSpanElement>(null)

  const chunk = chunkAt(tokens, currentIndex, chunkSize)
  const text = chunk?.text ?? ''
  const { pre, pivot, post } = splitPivot(text)

  // Measure-and-translate: shift the word so the pivot letter lands on the
  // fixed screen-center reticle. Font-agnostic (supports custom fonts).
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

  const emphasis = chunk.words[0]?.emphasis ?? []
  const cls = [
    'rsvp-word',
    emphasis.includes('strong') ? 'is-strong' : '',
    emphasis.includes('em') ? 'is-em' : '',
    chunk.listItem ? 'is-list' : '',
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
          <span className="rsvp-pre">{pre}</span>
          <span ref={pivotRef} className="rsvp-pivot">
            {pivot}
          </span>
          <span className="rsvp-post">{post}</span>
        </div>
      </div>
      <WpmIndicator />
    </div>
  )
}
