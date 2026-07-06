import type { ReactNode } from 'react'
import { useReader } from '../store/readerStore'
import {
  IconChevronLeft,
  IconChevronRight,
  IconEye,
  IconFastForward,
  IconPause,
  IconPlay,
} from './Icon'
import './ControlBar.css'

interface Action {
  /** Inline SVG icon (see Icon.tsx) — theme-colored via currentColor. */
  icon: ReactNode
  aria: string
  fn: () => void
}

/**
 * Touch CTAs for the keyboard shortcuts — the app is otherwise key-driven, so
 * on a phone there is no way to reveal/step/RSVP/pause/back without these.
 * Icon-only (aria-label + title carry the meaning) so the bar reads as a
 * quiet, always-available strip instead of a row of labeled CTAs. Deliberately
 * minimal: at most three buttons.
 */
export default function ControlBar() {
  const mode = useReader((s) => s.mode)
  const revealed = useReader((s) => s.revealed)
  const paused = useReader((s) => s.paused)
  const focusDeeper = useReader((s) => s.focusDeeper)
  const rsvpHere = useReader((s) => s.rsvpHere)
  const toggleRsvp = useReader((s) => s.toggleRsvp)
  const goBack = useReader((s) => s.goBack)

  // The countdown is a transient flash — no controls.
  if (mode === 'countdown') return null

  let back: Action | null = { icon: <IconChevronLeft />, aria: 'Back', fn: goBack }
  let primary: Action | null = null
  let speed: Action | null = null

  if (mode === 'section' && !revealed) {
    back = null // heading view is the top level
    primary = { icon: <IconChevronRight />, aria: 'Open this section', fn: focusDeeper }
  } else if (mode === 'section') {
    // Eye = focus on one unit at a time, vs fast-forward = continuous speed.
    primary = { icon: <IconEye />, aria: 'Focus — step through this section', fn: focusDeeper }
    speed = { icon: <IconFastForward />, aria: 'Speed-read this section (RSVP)', fn: rsvpHere }
  } else if (mode === 'stepping') {
    // prev/next are the big side arrows in StepView; bar just offers Back.
    primary = null
  } else if (mode === 'playing') {
    primary = paused
      ? { icon: <IconPlay />, aria: 'Resume', fn: toggleRsvp }
      : { icon: <IconPause />, aria: 'Pause', fn: toggleRsvp }
  }

  if (!back && !primary && !speed) return null

  return (
    <div className="control-bar" role="toolbar" aria-label="Reader controls">
      {[back, speed, primary].map(
        (a, i) =>
          a && (
            <button
              key={i}
              className={`cb-btn${a === primary ? ' cb-primary' : ''}`}
              onClick={a.fn}
              title={a.aria}
              aria-label={a.aria}
            >
              {a.icon}
            </button>
          ),
      )}
    </div>
  )
}
