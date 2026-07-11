import { useEffect, useRef, useState } from 'react'
import { useReader } from '../store/readerStore'
import { useFlow } from '../store/flowStore'
import { openReview, openMarkdown } from '../bridge/receiver'
import { useClickOutside } from './useClickOutside'
import './LibraryOverlay.css'

/** Compact relative arrival time ("just now", "3m ago", "2h ago", "5d ago"). */
function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

/** One switcher row — a markdown reader doc or a flow-review — normalized so the
 *  list renders and routes uniformly. */
interface Row {
  id: string
  title: string
  createdAt: number
  kind: 'markdown' | 'flow'
  unread: boolean
  /** Small uppercase tag shown at the row's end (source for md, "FLOW" for a review). */
  tag: string
}

/**
 * The unified document switcher: every doc pushed to the bridge this session —
 * markdown reads AND flow-review diffs — plus any locally-opened `.md`, newest
 * first. This is how the human moves between them: two agents can push a plan
 * (markdown) and a diff (flow review) and each is one pick away here, routed to
 * its native surface. Opens with `l` or the toggle; ↑↓ to move, Enter to open,
 * Esc/`l` to close. A badge on the toggle counts unread arrivals of either kind.
 *
 * When open, both view routers (ReaderView and FlowReviewView) bail on
 * `libraryOpen`, so the keys below own the keyboard without moving the reader
 * or the review underneath.
 */
export default function LibraryOverlay() {
  const library = useReader((s) => s.library)
  const activeDocId = useReader((s) => s.activeDocId)
  const reviews = useFlow((s) => s.reviews)
  const flowActive = useFlow((s) => s.stops.length > 0)
  const flowDocId = useFlow((s) => s.documentId)
  const open = useReader((s) => s.libraryOpen)
  const openLibrary = useReader((s) => s.openLibrary)
  const closeLibrary = useReader((s) => s.closeLibrary)
  const toggleLibrary = useReader((s) => s.toggleLibrary)

  // Merge both sources into one list, newest first. Markdown docs carry their
  // own unread flag; flow reviews carry theirs on the switcher metadata.
  const items: Row[] = [
    ...library.map(
      (d): Row => ({
        id: d.documentId,
        title: d.title,
        createdAt: d.createdAt,
        kind: 'markdown',
        unread: d.unread,
        tag: d.source === 'bridge' ? 'pushed' : 'local',
      }),
    ),
    ...reviews.map(
      (r): Row => ({
        id: r.documentId,
        title: r.title || 'Untitled review',
        createdAt: r.createdAt,
        kind: 'flow',
        unread: !!r.unread,
        tag: 'flow',
      }),
    ),
  ].sort((a, b) => b.createdAt - a.createdAt)

  const unread = items.reduce((n, d) => (d.unread ? n + 1 : n), 0)

  // Which row is the one currently on screen — the loaded flow when a review is
  // foregrounded, else the reader's active markdown doc.
  const isActive = (row: Row): boolean =>
    flowActive ? row.kind === 'flow' && row.id === flowDocId : row.kind === 'markdown' && row.id === activeDocId

  const [sel, setSel] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, open, closeLibrary)

  const openRow = (row: Row) => {
    if (row.kind === 'flow') openReview(row.id)
    else openMarkdown(row.id)
    closeLibrary()
  }

  // On open, land the cursor on the active doc (deps: only on the open edge).
  useEffect(() => {
    if (!open) return
    const i = items.findIndex(isActive)
    setSel(i >= 0 ? i : 0)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Owns its keys globally so it works on the landing screen, inside the reader,
  // and inside a flow review (`l` opens; both view routers bail on libraryOpen
  // so their nav never fires underneath). Ignores keys while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!open) {
        if (e.key === 'l' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault()
          openLibrary()
        }
        return
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSel((i) => Math.min(items.length - 1, i + 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSel((i) => Math.max(0, i - 1))
          break
        case 'Enter': {
          e.preventDefault()
          const d = items[sel]
          if (d) openRow(d)
          break
        }
        case 'Escape':
        case 'l':
          e.preventDefault()
          closeLibrary()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, items, sel, closeLibrary, openLibrary]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={ref} className={`library ${open ? 'open' : ''}`}>
      <button className="library-toggle" onClick={toggleLibrary} title="Documents (l)">
        <span aria-hidden="true">▤</span>
        {unread > 0 && <span className="library-badge">{unread}</span>}
      </button>

      {open && (
        <div className="library-body" role="listbox" aria-label="Documents">
          <div className="library-title">Documents · {items.length}</div>
          {items.length === 0 ? (
            <div className="library-empty">
              No documents yet. Paste or open a `.md` — or push one from an agent — to start.
            </div>
          ) : (
            <ul className="library-list">
              {items.map((d, i) => (
                <li
                  key={`${d.kind}:${d.id}`}
                  role="option"
                  aria-selected={i === sel}
                  className={`library-item${i === sel ? ' sel' : ''}${isActive(d) ? ' active' : ''}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => openRow(d)}
                >
                  <span className={`li-dot${d.unread ? ' unread' : ''}`} aria-hidden="true" />
                  <span className="li-title">{d.title}</span>
                  <span className={`li-src${d.kind === 'flow' ? ' flow' : ''}`}>{d.tag}</span>
                  <span className="li-time">{ago(d.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
