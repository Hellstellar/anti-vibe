import { useReader } from '../store/readerStore'
import { wpmAt } from '../lib/timing'
import './WpmIndicator.css'

/** Bottom-right live WPM readout (reflects the ramp). */
export default function WpmIndicator() {
  const wordIndex = useReader((s) => {
    const t = s.tokens[s.currentIndex]
    return t && t.kind === 'word' ? t.wordIndex : 0
  })
  const cfg = useReader((s) => s.cfg)
  const wpm = Math.round(
    wpmAt(wordIndex, cfg.startWpm, cfg.targetWpm, cfg.rampWords),
  )
  return <div className="wpm-indicator">{wpm} wpm</div>
}
