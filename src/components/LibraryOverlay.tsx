import { useEffect, useRef, useState } from 'react'
import { useReader } from '../store/readerStore'
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

/**
 * The document library: every doc pushed to the bridge this session, newest
 * first. Each push is retained (never clobbered), so this is how the human
 * navigates between them. Opens with `l` or the toggle; ↑↓ to move, Enter to
 * load, Esc/`l` to close. A badge on the toggle counts unread arrivals.
 *
 * When open, ReaderView's key router bails on `libraryOpen`, so the keys below
 * own the keyboard without colliding with reader navigation.
 */
export default function LibraryOverlay() {
  const library = useReader((s) => s.library)
  const activeDocId = useReader((s) => s.activeDocId)
  const open = useReader((s) => s.libraryOpen)
  const closeLibrary = useReader((s) => s.closeLibrary)
  const toggleLibrary = useReader((s) => s.toggleLibrary)
  const switchTo = useReader((s) => s.switchTo)

  const items = [...library].reverse() // newest first
  const unread = library.reduce((n, d) => (d.unread ? n + 1 : n), 0)

  const [sel, setSel] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, open, closeLibrary)

  // On open, land the cursor on the active doc (deps: only on the open edge).
  useEffect(() => {
    if (!open) return
    const i = items.findIndex((d) => d.documentId === activeDocId)
    setSel(i >= 0 ? i : 0)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
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
          if (d) {
            switchTo(d.documentId)
            closeLibrary()
          }
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
  }, [open, items, sel, switchTo, closeLibrary])

  if (library.length === 0) return null

  const choose = (documentId: string) => {
    switchTo(documentId)
    closeLibrary()
  }

  return (
    <div ref={ref} className={`library ${open ? 'open' : ''}`}>
      <button className="library-toggle" onClick={toggleLibrary} title="Documents (l)">
        <span aria-hidden="true">▤</span>
        {unread > 0 && <span className="library-badge">{unread}</span>}
      </button>

      {open && (
        <div className="library-body" role="listbox" aria-label="Received documents">
          <div className="library-title">Documents · {library.length}</div>
          <ul className="library-list">
            {items.map((d, i) => (
              <li
                key={d.documentId}
                role="option"
                aria-selected={i === sel}
                className={`library-item${i === sel ? ' sel' : ''}${
                  d.documentId === activeDocId ? ' active' : ''
                }`}
                onMouseEnter={() => setSel(i)}
                onClick={() => choose(d.documentId)}
              >
                <span className={`li-dot${d.unread ? ' unread' : ''}`} aria-hidden="true" />
                <span className="li-title">{d.title}</span>
                <span className="li-time">{ago(d.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
