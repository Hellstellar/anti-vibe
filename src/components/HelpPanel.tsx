import { useState } from 'react'
import { useReader } from '../store/readerStore'
import './HelpPanel.css'

type Row = [keys: string, desc: string]

const COMMON: Row[] = [
  ['⌘↓ / ⌘→', 'next section'],
  ['⌘↑ / ⌘←', 'previous section'],
  ['⌘ enter', 'RSVP this section'],
  ['esc', 'back one level'],
  ['✕', 'exit to landing'],
]

const VIEWS: Record<string, { title: string; rows: Row[] }> = {
  landing: {
    title: 'landing',
    rows: [
      ['paste & read', 'read markdown from the clipboard'],
      ['open .md file', 'read a markdown file'],
      ['', 'shortcuts appear inside the reader'],
    ],
  },
  heading: {
    title: 'heading view',
    rows: [
      ['↑ / ↓', 'move between headings'],
      ['enter', 'open this section'],
      ['click', 'open a heading'],
      ...COMMON,
    ],
  },
  reading: {
    title: 'reading view',
    rows: [
      ['enter', 'step through this section'],
      ['click a word', 'RSVP from that word'],
      ['↑ / ↓', 'scroll'],
      ['← / →', 'scroll wide content'],
      ['space', 'pause / resume RSVP'],
      ...COMMON,
    ],
  },
  step: {
    title: 'step view',
    rows: [
      ['→ / enter', 'next unit'],
      ['← / shift+enter', 'previous unit'],
      ['↑ / ↓', 'scroll the unit'],
      ...COMMON,
    ],
  },
  rsvp: {
    title: 'RSVP',
    rows: [
      ['space', 'pause'],
      ['esc', 'back to reading'],
    ],
  },
}

export default function HelpPanel() {
  const mode = useReader((s) => s.mode)
  const revealed = useReader((s) => s.revealed)
  const hasContent = useReader((s) => s.tokens.length > 0)
  const [open, setOpen] = useState(false)

  let key = 'landing'
  if (hasContent) {
    if (mode === 'playing') key = 'rsvp'
    else if (mode === 'stepping') key = 'step'
    else key = revealed ? 'reading' : 'heading'
  }
  const view = VIEWS[key]

  return (
    <div className={`help ${open ? 'open' : ''}`}>
      <button
        className="help-toggle"
        onClick={() => setOpen((o) => !o)}
        title="Shortcuts"
      >
        ?
      </button>

      {open && (
        <div className="help-body">
          <div className="help-title">{view.title}</div>
          <dl className="help-rows">
            {view.rows.map(([keys, desc], i) => (
              <div className="help-row" key={i}>
                {keys ? <dt>{keys}</dt> : <dt className="help-note" />}
                <dd className={keys ? '' : 'help-note'}>{desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
