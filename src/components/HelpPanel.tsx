import { useRef, useState } from 'react'
import { useFlow } from '../store/flowStore'
import { useReader } from '../store/readerStore'
import { useClickOutside } from './useClickOutside'
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
  flow: {
    title: 'flow review',
    rows: [
      ['→ / ↓ / j', 'next hunk, then follow the call'],
      ['← / ↑ / k', 'previous hunk'],
      ['enter', 'focus this hunk'],
      ['m', 'open the flow map'],
      ['esc', 'back along your path'],
      ['click a node', 'jump to that stop'],
      ['✕', 'exit review'],
    ],
  },
  flowFocus: {
    title: 'flow review · focus',
    rows: [
      ['→ / ↓ / j', 'next hunk'],
      ['← / ↑ / k', 'previous hunk'],
      ['esc', 'exit focus'],
    ],
  },
  flowMap: {
    title: 'flow map',
    rows: [
      ['click a node', 'jump to that stop'],
      ['esc / m', 'close the map'],
    ],
  },
  flowBranch: {
    title: 'flow review · branch',
    rows: [
      ['1–9', 'pick a path to follow'],
      ['esc', 'stay here'],
    ],
  },
}

export default function HelpPanel() {
  const mode = useReader((s) => s.mode)
  const revealed = useReader((s) => s.revealed)
  const hasContent = useReader((s) => s.tokens.length > 0)
  const flowActive = useFlow((s) => s.stops.length > 0)
  const focusMode = useFlow((s) => s.focusMode)
  const mapOpen = useFlow((s) => s.mapOpen)
  const branchPending = useFlow((s) => s.pendingBranch !== null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, open, () => setOpen(false))

  let key = 'landing'
  if (flowActive) {
    // Same precedence as the FlowReviewView keydown handler.
    if (branchPending) key = 'flowBranch'
    else if (mapOpen) key = 'flowMap'
    else if (focusMode) key = 'flowFocus'
    else key = 'flow'
  } else if (hasContent) {
    if (mode === 'playing') key = 'rsvp'
    else if (mode === 'stepping') key = 'step'
    else key = revealed ? 'reading' : 'heading'
  }
  const view = VIEWS[key]

  return (
    <div ref={ref} className={`help ${open ? 'open' : ''}`}>
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
                <dt>
                  {keys
                    ? keys.split(' / ').map((k, j) => (
                        <span key={j}>
                          {j > 0 && <span className="help-sep">/</span>}
                          <kbd>{k}</kbd>
                        </span>
                      ))
                    : null}
                </dt>
                <dd className={keys ? '' : 'help-note'}>{desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
