import { useEffect, useRef, useState } from 'react'
import { useReader } from '../store/readerStore'
import { buildAnchor } from '../lib/comments'
import { buildFeedbackPrompt } from '../lib/feedbackPrompt'
import { useClickOutside } from './useClickOutside'
import { sfx } from '../lib/sfx'
import type { CommentAnchor, CommentScope } from '../lib/types'
import './CommentLayer.css'

interface Draft {
  anchor: CommentAnchor | null
  scope: CommentScope
}

/** Token-index range [lo, hi] covered by the current text selection, using
 *  the data-token-index spans painted by the reading/step views. Robust to
 *  selections that start or end in the whitespace between words. */
function selectedRange(): [number, number] | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  let lo = Infinity
  let hi = -Infinity
  document.querySelectorAll<HTMLElement>('[data-token-index]').forEach((el) => {
    if (sel.containsNode(el, true)) {
      const i = Number(el.dataset.tokenIndex)
      if (i < lo) lo = i
      if (i > hi) hi = i
    }
  })
  return hi >= 0 ? [lo, hi] : null
}

/** Decide what the next comment should anchor to, given the current view:
 *  an active text selection (span) wins everywhere; otherwise the focused
 *  step unit, the open section, or a general note as a last resort. */
function buildDraft(): Draft | null {
  const s = useReader.getState()
  if (s.tokens.length === 0) return null
  const mk = (tokenStart: number, tokenEnd: number, scope: Exclude<CommentScope, 'document'>): Draft => ({
    scope,
    anchor: buildAnchor({
      src: s.src,
      tokens: s.tokens,
      blocks: s.blocks,
      sections: s.sections,
      tokenStart,
      tokenEnd,
      scope,
    }),
  })

  const range = selectedRange()
  if (range) return mk(range[0], range[1], 'span')

  if (s.mode === 'stepping') {
    const unit = s.stepUnits[s.stepIndex]
    const ws = unit?.words
    if (ws && ws.length) return mk(ws[0].index, ws[ws.length - 1].index, 'span')
    const b = unit ? s.blocks[unit.groupId] : undefined
    if (b) return mk(b.tokenStart, b.tokenEnd, 'block')
  }

  if (s.mode === 'section' && s.revealed) {
    const sec = s.sections[s.currentSection]
    if (sec) return mk(sec.tokenStart, sec.tokenEnd, 'section')
  }

  // Heading list, RSVP playback, or no better target — a whole-document note.
  return { anchor: null, scope: 'document' }
}

function truncate(text: string, n = 120): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

export default function CommentLayer() {
  const comments = useReader((s) => s.comments)
  const hasContent = useReader((s) => s.tokens.length > 0)
  const addComment = useReader((s) => s.addComment)
  const removeComment = useReader((s) => s.removeComment)
  const resolveComment = useReader((s) => s.resolveComment)
  const clearComments = useReader((s) => s.clearComments)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [body, setBody] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  // Live token range of the current text selection, tracked so a touch tap on
  // the Comment button (which would otherwise collapse the selection) still
  // knows what to anchor to. Also drives the button's "on selection" label.
  const [selRange, setSelRange] = useState<[number, number] | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  useClickOutside(panelRef, panelOpen, () => setPanelOpen(false))

  const openComposer = (d: Draft) => {
    setBody('')
    setDraft(d)
    sfx.click()
  }

  const closeComposer = () => setDraft(null)

  const save = () => {
    if (!draft || !body.trim()) return
    addComment({ anchor: draft.anchor, scope: draft.scope, body: body.trim() })
    sfx.reveal()
    setDraft(null)
  }

  // Open the composer for the current focus. Prefers the tracked selection (so
  // touch taps that collapse the live selection still anchor to a span), then
  // falls back to the focused step unit / open section / general note.
  const capture = () => {
    if (draft) return
    const s = useReader.getState()
    if (s.tokens.length === 0) return
    const range = selRange ?? selectedRange()
    let d: Draft | null
    if (range) {
      d = {
        scope: 'span',
        anchor: buildAnchor({
          src: s.src,
          tokens: s.tokens,
          blocks: s.blocks,
          sections: s.sections,
          tokenStart: range[0],
          tokenEnd: range[1],
          scope: 'span',
        }),
      }
    } else {
      d = buildDraft()
    }
    if (d) openComposer(d)
  }

  // Track the selection so the (touch) Comment button knows the span even after
  // the tap clears it. rAF-coalesced; skips the token scan when collapsed.
  useEffect(() => {
    if (!hasContent) {
      setSelRange(null)
      return
    }
    let raf = 0
    const onSel = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setSelRange(selectedRange()))
    }
    document.addEventListener('selectionchange', onSel)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('selectionchange', onSel)
    }
  }, [hasContent])

  // `c` captures a comment for the current focus (desktop shortcut). Ignored
  // while typing or while a composer is already open.
  useEffect(() => {
    if (!hasContent) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'c' || e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      if (draft) return
      e.preventDefault()
      capture()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasContent, draft, selRange])

  const copyPrompt = async () => {
    const prompt = buildFeedbackPrompt(useReader.getState().comments, useReader.getState().docTitle)
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      sfx.reveal()
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked — no-op; the prompt is still derivable on demand */
    }
  }

  if (!hasContent) return null

  const active = comments.filter((c) => !c.resolved)

  return (
    <>
      {/* Toggle — sits left of the exit ✕, mirrors the help/settings buttons. */}
      <div ref={panelRef} className={`comments ${panelOpen ? 'open' : ''}`}>
        <button
          className="comments-toggle"
          // Keep any live text selection alive across the tap so the panel's
          // "Comment on selection" action can anchor to it.
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setPanelOpen((o) => !o)}
          title="Comments"
        >
          ✎{active.length > 0 && <span className="comments-badge">{active.length}</span>}
        </button>

        {panelOpen && (
          <div className="comments-body">
            <div className="comments-head">
              <span className="comments-title">Comments</span>
              <div className="comments-head-actions">
                {selRange && (
                  <button
                    className="comments-capture"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={capture}
                    title="Comment on selection"
                    aria-label="Comment on selection"
                  >
                    ✎
                  </button>
                )}
                <button
                  className="comments-add"
                  onClick={() => openComposer({ anchor: null, scope: 'document' })}
                  title="Add a general note"
                >
                  + note
                </button>
              </div>
            </div>

            {comments.length === 0 ? (
              <div className="comments-empty">
                Select text to comment on it, or add a general note above.
              </div>
            ) : (
              <ul className="comments-list">
                {comments.map((c) => (
                  <li key={c.id} className={`comment-row ${c.resolved ? 'resolved' : ''}`}>
                    {c.anchor ? (
                      <div className="comment-quote" title={c.anchor.quote}>
                        “{truncate(c.anchor.quote, 70)}”
                      </div>
                    ) : (
                      <div className="comment-quote general">general note</div>
                    )}
                    <div className="comment-text">{c.body}</div>
                    <div className="comment-actions">
                      <button
                        onClick={() => resolveComment(c.id, !c.resolved)}
                        title={c.resolved ? 'Reopen' : 'Resolve'}
                      >
                        {c.resolved ? '↺' : '✓'}
                      </button>
                      <button onClick={() => removeComment(c.id)} title="Delete">
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="comments-foot">
              <button
                className="comments-copy"
                onClick={copyPrompt}
                disabled={active.length === 0}
                title="Copy a feedback prompt for your agent"
              >
                {copied ? 'Copied ✓' : 'Copy feedback prompt'}
              </button>
              {comments.length > 0 && (
                <button className="comments-clear" onClick={clearComments} title="Delete all">
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Composer modal */}
      {draft && (
        <div className="composer-backdrop" onClick={closeComposer}>
          <div className="composer" onClick={(e) => e.stopPropagation()}>
            <div className="composer-anchor">
              {draft.anchor ? (
                <>
                  <span className="composer-scope">{draft.scope}</span>
                  <span className="composer-quote">“{truncate(draft.anchor.quote)}”</span>
                </>
              ) : (
                <span className="composer-scope">general note · whole document</span>
              )}
            </div>
            <textarea
              ref={textRef}
              className="composer-input"
              placeholder="Your feedback…"
              value={body}
              autoFocus
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  closeComposer()
                } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  save()
                }
              }}
            />
            <div className="composer-foot">
              <span className="composer-hint">
                <kbd>⌘↵</kbd> save · <kbd>esc</kbd> cancel
              </span>
              <div className="composer-btns">
                <button className="composer-cancel" onClick={closeComposer}>
                  Cancel
                </button>
                <button className="composer-save" onClick={save} disabled={!body.trim()}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
