import { useEffect, useState } from 'react'
import { sfx } from '../lib/sfx'
import './Countdown.css'

const STEPS = ['READY', 'SET', 'FOCUS']
const STEP_MS = 350

/** Ready → Set → Focus sequence, then fires onDone to begin playback. */
export default function Countdown({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)

  useEffect(() => {
    if (i >= STEPS.length) {
      onDone()
      return
    }
    sfx.tick(i === STEPS.length - 1) // brighter beep on the final "FOCUS"
    const t = setTimeout(() => setI((n) => n + 1), STEP_MS)
    return () => clearTimeout(t)
  }, [i, onDone])

  if (i >= STEPS.length) return null

  return (
    <div className="countdown">
      <div className="countdown-body">
        <div key={i} className="countdown-word">
          {STEPS[i]}
        </div>
        <div className="countdown-dots" aria-hidden="true">
          {STEPS.map((_, idx) => (
            <span key={idx} className={`countdown-dot${idx <= i ? ' lit' : ''}`} />
          ))}
        </div>
      </div>
    </div>
  )
}
