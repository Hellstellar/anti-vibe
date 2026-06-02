import { useEffect } from 'react'
import { useReader } from '../store/readerStore'
import Countdown from './Countdown'
import RsvpStage from './RsvpStage'
import PauseSpotlight from './PauseSpotlight'
import AtomicBlockView from './AtomicBlockView'
import SettingsPanel from './SettingsPanel'
import './ReaderView.css'

export default function ReaderView() {
  const mode = useReader((s) => s.mode)
  const currentIndex = useReader((s) => s.currentIndex)
  const total = useReader((s) => s.tokens.length)
  const startCountdown = useReader((s) => s.startCountdown)
  const togglePause = useReader((s) => s.togglePause)
  const step = useReader((s) => s.step)
  const run = useReader((s) => s.run)
  const exit = useReader((s) => s.exit)

  // Auto-start the countdown when the reader first opens.
  useEffect(() => {
    startCountdown()
  }, [startCountdown])

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing in the fallback textarea, etc.
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePause()
          break
        case 'ArrowRight':
          e.preventDefault()
          step(1)
          break
        case 'ArrowLeft':
          e.preventDefault()
          step(-1)
          break
        case 'Escape':
          e.preventDefault()
          exit()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePause, step, exit])

  const atEnd = currentIndex >= total

  return (
    <div className="reader">
      <button className="exit-button" onClick={exit} title="Exit (Esc)">
        ✕
      </button>

      {mode === 'countdown' && <Countdown onDone={run} />}
      {mode === 'playing' && <RsvpStage />}
      {mode === 'paused' && <PauseSpotlight />}
      {mode === 'atomic' && <AtomicBlockView />}
      {mode === 'idle' && atEnd && (
        <div className="finished">
          <div className="finished-title">— end —</div>
          <button className="big-button small" onClick={() => exit()}>
            READ SOMETHING ELSE
          </button>
        </div>
      )}

      <SettingsPanel />
    </div>
  )
}
