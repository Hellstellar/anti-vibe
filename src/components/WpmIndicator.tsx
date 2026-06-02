import { useReader } from '../store/readerStore'
import { wpmAt } from '../lib/timing'
import './WpmIndicator.css'

/** Bottom-right live WPM readout (reflects the ramp). */
export default function WpmIndicator() {
  const currentIndex = useReader((s) => s.currentIndex)
  const cfg = useReader((s) => s.cfg)
  const wpm = Math.round(
    wpmAt(currentIndex, cfg.startWpm, cfg.targetWpm, cfg.rampWords),
  )
  return <div className="wpm-indicator">{wpm} wpm</div>
}
