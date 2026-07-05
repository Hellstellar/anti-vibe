import { useReader } from '../store/readerStore'
import './ControlBar.css'

interface Action {
  /** Plain text/dingbat glyph only — never a pictographic emoji, which
   *  renders in its own fixed multicolor style and ignores `color`. */
  icon: string
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

  let back: Action | null = { icon: '‹', aria: 'Back', fn: goBack }
  let primary: Action | null = null
  let speed: Action | null = null

  if (mode === 'section' && !revealed) {
    back = null // heading view is the top level
    primary = { icon: '›', aria: 'Open this section', fn: focusDeeper }
  } else if (mode === 'section') {
    primary = { icon: '›', aria: 'Step through this section', fn: focusDeeper }
    speed = { icon: '»', aria: 'Speed-read this section (RSVP)', fn: rsvpHere }
  } else if (mode === 'stepping') {
    // prev/next are the big side arrows in StepView; bar just offers Back.
    primary = null
  } else if (mode === 'playing') {
    primary = paused
      ? { icon: '▸', aria: 'Resume', fn: toggleRsvp }
      : { icon: '‖', aria: 'Pause', fn: toggleRsvp }
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
              <span aria-hidden="true">{a.icon}</span>
            </button>
          ),
      )}
    </div>
  )
}
