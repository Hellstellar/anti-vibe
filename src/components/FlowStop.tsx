import { useMemo, useRef, useState } from 'react'
import { diffRows } from '../lib/intralineDiff'
import { buildMarkdownDiff, isMarkdownFile } from '../lib/markdownDiff'
import {
  EDITORS,
  buildEditorUrl,
  loadCustomTemplate,
  loadEditorId,
  saveCustomTemplate,
  saveEditorId,
} from '../lib/editors'
import type { ResolvedFlowStop } from '../lib/types'
import { IconChevronLeft, IconChevronRight, IconExternalLink, IconEye, IconFileText } from './Icon'
import { useClickOutside } from './useClickOutside'
import MarkdownBlocks from './MarkdownBlocks'
import './FlowStop.css'

function DiffView({ text }: { text: string }) {
  if (!text.trim()) {
    return <div className="fs-diff-missing">(diff not resolved — hunk not found in git diff)</div>
  }
  // Hide the `@@ ... @@` hunk header — it's line-number noise; the target line
  // lives in the "open in editor" link. The rest is diffed at the token level
  // so only the changed words are highlighted, not the whole line.
  const lines = text
    .replace(/\n$/, '')
    .split('\n')
    .filter((l) => !l.startsWith('@@'))
  const rows = diffRows(lines)
  return (
    <pre className="fs-diff">
      <code>
        {rows.map((row, i) => {
          const empty = row.segs.every((s) => s.text.length === 0)
          return (
            // Row keeps the subtle tint + gutter; changed tokens get a stronger
            // .df-word emphasis on top (add/del is shown by color, so the leading
            // +/-/space marker is dropped as noise). Blank rows render a space so
            // they don't collapse to zero height.
            <span key={i} className={`df-line df-${row.kind}`}>
              {empty
                ? ' '
                : row.segs.map((seg, j) =>
                    seg.changed ? (
                      <span key={j} className="df-word">
                        {seg.text}
                      </span>
                    ) : (
                      <span key={j}>{seg.text}</span>
                    ),
                  )}
            </span>
          )
        })}
      </code>
    </pre>
  )
}

/** Rendered markdown diff (for `.md` files): each hunk chunk is rendered as
 *  prose, tinted by side, so a docs change reads as prose instead of raw `+`/`-`
 *  source. See lib/markdownDiff for the chunk-level granularity. */
function MarkdownDiffView({ text }: { text: string }) {
  const chunks = useMemo(() => buildMarkdownDiff(text), [text])
  if (!text.trim()) {
    return <div className="fs-diff-missing">(diff not resolved — hunk not found in git diff)</div>
  }
  return (
    <div className="fs-mddiff">
      {chunks.map((c, i) => (
        // MarkdownBlocks renders null for a blank/whitespace-only run, so empty
        // context chunks don't leave tinted gaps.
        <MarkdownBlocks key={i} markdown={c.markdown} className={`fs-mddiff-chunk ${c.kind}`} />
      ))}
    </div>
  )
}

/** Picks how a hunk is shown: rendered markdown for `.md` files (with a toggle
 *  back to the exact raw unified diff), and the raw token-diff for every other
 *  file type (unchanged behaviour). */
function HunkDiff({ text, file, minimal }: { text: string; file: string; minimal?: boolean }) {
  const [raw, setRaw] = useState(false)
  if (!isMarkdownFile(file)) return <DiffView text={text} />
  return (
    <div className="fs-hunkdiff">
      {!minimal && (
        <button
          className="fs-diff-toggle"
          onClick={() => setRaw((r) => !r)}
          title={raw ? 'Show rendered markdown' : 'Show raw diff'}
          aria-pressed={raw}
        >
          {raw ? '¶ rendered' : '⟨⟩ raw diff'}
        </button>
      )}
      {raw ? <DiffView text={text} /> : <MarkdownDiffView text={text} />}
    </div>
  )
}

/** "Open in editor" — an icon button that opens a popover with the deep link
 *  plus the editor picker (which editor + custom URL template, persisted). */
function OpenInEditor({ absPath, line }: { absPath?: string; line?: number }) {
  const [open, setOpen] = useState(false)
  const [editorId, setEditorId] = useState(loadEditorId)
  const [template, setTemplate] = useState(loadCustomTemplate)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, open, () => setOpen(false))

  const href = buildEditorUrl(editorId, absPath, line, template)
  const label = EDITORS.find((e) => e.id === editorId)?.label ?? 'editor'

  const onEditor = (id: string) => {
    setEditorId(id)
    saveEditorId(id)
  }
  const onTemplate = (tpl: string) => {
    setTemplate(tpl)
    saveCustomTemplate(tpl)
  }

  return (
    <div className="fs-open" ref={ref}>
      <button
        className={`fs-icon-btn${open ? ' active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Open in editor"
        aria-label="Open in editor"
      >
        <IconExternalLink />
      </button>
      {open && (
        <div className="fs-open-pop">
          {href ? (
            <a className="fs-open-cta" href={href} title={`${absPath}${line ? `:${line}` : ''}`}>
              Open in {label} ↗
            </a>
          ) : (
            <span
              className="fs-open-cta disabled"
              title={absPath ? 'Set a valid custom template' : 'No file path available'}
            >
              Open in {label} ↗
            </span>
          )}
          <select
            className="fs-open-select"
            value={editorId}
            onChange={(e) => onEditor(e.target.value)}
            aria-label="Choose editor"
          >
            {EDITORS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          {editorId === 'custom' && (
            <input
              className="fs-open-template"
              type="text"
              value={template}
              placeholder="myide://open?file={path}&line={line}"
              onChange={(e) => onTemplate(e.target.value)}
              spellCheck={false}
            />
          )}
        </div>
      )}
    </div>
  )
}

/** The stepper — prev/next only, no counter (the app never shows progress).
 *  Always shown: with one hunk the arrows step across stops (nextHunk follows
 *  the call graph at a file's end), so they never vanish. */
function HunkNav({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  return (
    <div className="fs-hunk-nav">
      <button className="fs-icon-btn" onClick={onPrev} title="Previous (←)" aria-label="Previous">
        <IconChevronLeft />
      </button>
      <button className="fs-icon-btn" onClick={onNext} title="Next (→)" aria-label="Next">
        <IconChevronRight />
      </button>
    </div>
  )
}

export default function FlowStop({
  stop,
  hunkIndex,
  minimal,
  calls,
  onNextHunk,
  onPrevHunk,
  onEnterFocus,
  onGotoStop,
}: {
  stop: ResolvedFlowStop
  hunkIndex: number
  minimal: boolean
  calls: { stop: ResolvedFlowStop; via?: string }[]
  onNextHunk: () => void
  onPrevHunk: () => void
  onEnterFocus: () => void
  onGotoStop: (id: string) => void
}) {
  // Whether the prose description is expanded (hidden by default — the diff is
  // the focus; the write-up is opt-in).
  const [showDesc, setShowDesc] = useState(false)

  const idx = Math.min(hunkIndex, Math.max(0, stop.hunks.length - 1))
  const hunk = stop.hunks[idx]

  const CallsInto = () =>
    calls.length > 0 ? (
      <div className="fs-calls">
        <span className="fs-calls-label">calls into</span>
        {calls.map((c) => (
          <button key={c.stop.id} className="fs-call-chip" onClick={() => onGotoStop(c.stop.id)}>
            {c.stop.title} {c.via && <span className="fs-call-via">via {c.via}</span>} →
          </button>
        ))}
      </div>
    ) : null

  // Context step: a connective, unchanged node. No diff / stepper / editor link —
  // just enough to keep the flow reading continuously.
  if (stop.context) {
    return (
      <div className={`flow-stop context${minimal ? ' minimal' : ''}`}>
        <div className="fs-file">
          {stop.file}
          <span className="fs-tag fs-tag-context">unchanged</span>
        </div>
        <h2 className="fs-title">{stop.title}</h2>
        {stop.oneLineSummary && <p className="fs-summary">{stop.oneLineSummary}</p>}
        <MarkdownBlocks markdown={stop.explanation} />
        {!minimal && (
          <div className="fs-footer">
            <CallsInto />
          </div>
        )}
      </div>
    )
  }

  // Minimal focus mode: one hunk, a compact location line, nothing else.
  if (minimal) {
    return (
      <div className="flow-stop minimal">
        <div className="fs-focus-loc">
          <span className="fs-focus-file">{stop.file}</span>
          <span className="fs-focus-title">{stop.title}</span>
        </div>
        <HunkNav onPrev={onPrevHunk} onNext={onNextHunk} />
        <HunkDiff text={hunk?.diffText ?? ''} file={stop.file} minimal />
      </div>
    )
  }

  return (
    <div className={`flow-stop${showDesc ? ' desc-open' : ''}`}>
      <header className="fs-head">
        <div className="fs-loc">
          <div className="fs-file">
            {stop.file}
            {stop.matchStatus === 'fuzzy' && <span className="fs-match fs-match-fuzzy">~ fuzzy match</span>}
            {stop.matchStatus === 'missing' && <span className="fs-match fs-match-missing">! no diff</span>}
          </div>
          <h2 className="fs-title">{stop.title}</h2>
        </div>
        <div className="fs-tools">
          <button
            className={`fs-icon-btn${showDesc ? ' active' : ''}`}
            onClick={() => setShowDesc((v) => !v)}
            title={showDesc ? 'Hide description' : 'Show description'}
            aria-label={showDesc ? 'Hide description' : 'Show description'}
            aria-pressed={showDesc}
          >
            <IconFileText />
          </button>
          <OpenInEditor absPath={stop.absPath} line={hunk?.line} />
          <button
            className="fs-icon-btn"
            onClick={onEnterFocus}
            title="Focus this hunk (Enter)"
            aria-label="Focus this hunk"
          >
            <IconEye />
          </button>
        </div>
      </header>

      {stop.oneLineSummary && <p className="fs-summary">{stop.oneLineSummary}</p>}

      <HunkNav onPrev={onPrevHunk} onNext={onNextHunk} />

      <HunkDiff text={hunk?.diffText ?? ''} file={stop.file} />

      {showDesc && <MarkdownBlocks markdown={stop.explanation} />}

      <div className="fs-footer">
        <CallsInto />
      </div>
    </div>
  )
}
