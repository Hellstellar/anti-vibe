import { useRef, useState } from 'react'
import { useReader } from '../store/readerStore'
import './LandingView.css'

export default function LandingView() {
  const load = useReader((s) => s.load)
  const [fallback, setFallback] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return
    const content = await file.text()
    if (!content.trim()) {
      setError('That file is empty.')
      return
    }
    load(content)
  }

  return (
    <div className="landing">
      <div className="landing-title">RSVP&nbsp;READER</div>
      <div className="landing-sub">review LLM output without the fatigue</div>

      {!fallback ? (
        <div className="landing-actions">
          <button className="big-button" onClick={pasteAndRead}>
            <span className="big-button-glow" />
            PASTE &amp; READ
          </button>
          <button
            className="big-button alt"
            onClick={() => fileRef.current?.click()}
          >
            OPEN .MD FILE
          </button>
        </div>
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

      <input
        ref={fileRef}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        style={{ display: 'none' }}
        onChange={onFile}
      />

      {error && <div className="landing-error">{error}</div>}
      <div className="landing-hint">
        enter ▸ reveal / next &nbsp;·&nbsp; shift+enter ▸ prev &nbsp;·&nbsp; click ▸
        speed-read &nbsp;·&nbsp; space ▸ play/pause
      </div>
    </div>
  )
}
