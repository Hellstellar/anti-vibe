import { useEffect } from 'react'
import { useReader } from '../store/readerStore'
import Countdown from './Countdown'
import RsvpStage from './RsvpStage'
import SectionView from './SectionView'
import './ReaderView.css'

export default function ReaderView() {
  const mode = useReader((s) => s.mode)
  const startCountdown = useReader((s) => s.startCountdown)
  const enterReading = useReader((s) => s.enterReading)
  const enterKey = useReader((s) => s.enterKey)
  const prevSection = useReader((s) => s.prevSection)
  const toggleRsvp = useReader((s) => s.toggleRsvp)
  const exit = useReader((s) => s.exit)

  // Auto-start the countdown when the reader first opens.
  useEffect(() => {
    startCountdown()
  }, [startCountdown])

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          toggleRsvp()
          break
        case 'Enter':
          e.preventDefault()
          if (e.shiftKey) prevSection()
          else enterKey()
          break
        case 'Escape':
          e.preventDefault()
          exit()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleRsvp, enterKey, prevSection, exit])

  return (
    <div className="reader">
      <button className="exit-button" onClick={exit} title="Exit (Esc)">
        ✕
      </button>

      {mode === 'countdown' && <Countdown onDone={enterReading} />}
      {mode === 'playing' && <RsvpStage />}
      {mode === 'section' && <SectionView />}
    </div>
  )
}
