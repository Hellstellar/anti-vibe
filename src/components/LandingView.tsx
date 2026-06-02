import { useState } from 'react'
import { useReader } from '../store/readerStore'
import './LandingView.css'

export default function LandingView() {
  const load = useReader((s) => s.load)
  const [fallback, setFallback] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const pasteAndRead = async () => {
    setError(null)
    try {
      const clip = await navigator.clipboard.readText()
      if (!clip.trim()) {
        setError('Clipboard is empty. Copy some markdown first.')
        return
      }
      load(clip)
    } catch {
      // Clipboard blocked (permissions / insecure context) — fall back.
      setFallback(true)
    }
  }

  return (
    <div className="landing">
      <div className="landing-title">RSVP&nbsp;READER</div>
      <div className="landing-sub">speed-read llm output · markdown</div>

      {!fallback ? (
        <button className="big-button" onClick={pasteAndRead}>
          <span className="big-button-glow" />
          PASTE &amp; READ
        </button>
      ) : (
        <div className="fallback">
          <textarea
            className="fallback-input"
            placeholder="Paste markdown here…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <button
            className="big-button small"
            disabled={!text.trim()}
            onClick={() => load(text)}
          >
            READ
          </button>
        </div>
      )}

      {error && <div className="landing-error">{error}</div>}
      <div className="landing-hint">
        space ▸ pause/resume &nbsp;·&nbsp; ← → ▸ step &nbsp;·&nbsp; esc ▸ exit
      </div>
    </div>
  )
}
