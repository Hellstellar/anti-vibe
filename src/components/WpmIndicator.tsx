import { useReader } from '../store/readerStore'
import { wpmAt } from '../lib/timing'
import './WpmIndicator.css'

/** Bottom-right live WPM readout (reflects the ramp). */
export default function WpmIndicator() {
  const rampPos = useReader((s) => {
    const t = s.tokens[s.currentIndex]
    const wi = t && t.kind === 'word' ? t.wordIndex : 0
    return Math.max(0, wi - s.rampStart)
  })
  const cfg = useReader((s) => s.cfg)
  const wpm = Math.round(
    wpmAt(rampPos, cfg.startWpm, cfg.targetWpm, cfg.rampWords),
  )
  return <div className="wpm-indicator">{wpm} wpm</div>
}
