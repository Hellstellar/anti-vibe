import { useReader } from '../store/readerStore'
import './ControlBar.css'

/**
 * Touch CTAs for the keyboard shortcuts — the app is otherwise key-driven, so
 * on a phone there is no way to reveal/step/RSVP/pause/back without these.
 * Deliberately minimal: at most three buttons, and the primary one always
 * spells out the next "focus deeper" step (heading -> reading -> step) so the
 * progression is discoverable instead of hidden behind Enter.
 */
export default function ControlBar() {
  const mode = useReader((s) => s.mode)
  const revealed = useReader((s) => s.revealed)
  const focusDeeper = useReader((s) => s.focusDeeper)
  const rsvpSection = useReader((s) => s.rsvpSection)
  const toggleRsvp = useReader((s) => s.toggleRsvp)
  const goBack = useReader((s) => s.goBack)

  // The countdown is a transient flash — no controls.
  if (mode === 'countdown') return null

  let back: (() => void) | null = goBack
  let primary: { label: string; sub: string; fn: () => void } | null = null
  let speed: (() => void) | null = null

  if (mode === 'section' && !revealed) {
    back = null // heading view is the top level
    primary = { label: 'Open', sub: 'reveal', fn: focusDeeper }
  } else if (mode === 'section') {
    primary = { label: 'Focus', sub: '', fn: focusDeeper }
    speed = rsvpSection
  } else if (mode === 'stepping') {
    // prev/next are the big side arrows in StepView; bar just offers Back.
    primary = null
  } else if (mode === 'playing') {
    primary = { label: 'Pause', sub: '‖', fn: toggleRsvp }
  }

  if (!back && !primary && !speed) return null

  return (
    <div className="control-bar" role="toolbar" aria-label="Reader controls">
      {back && (
        <button className="cb-btn cb-back" onClick={back} title="Back (esc)">
          ‹ Back
        </button>
      )}
      {speed && (
        <button
          className="cb-btn cb-icon cb-speed"
          onClick={speed}
          title="Speed-read this section (RSVP)"
          aria-label="Speed-read this section (RSVP)"
        >
          <span aria-hidden="true">⚡</span>
        </button>
      )}
      {primary && (
        <button
          className="cb-btn cb-primary"
          onClick={primary.fn}
          title={`${primary.label} — ${primary.sub}`}
        >
          {primary.label}
          {primary.sub && <span className="cb-sub">{primary.sub}</span>}
        </button>
      )}
    </div>
  )
}
