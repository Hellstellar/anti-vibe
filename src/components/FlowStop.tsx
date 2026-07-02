import { useMemo, useState } from 'react'
import { parseMarkdown } from '../lib/parseMarkdown'
import {
  EDITORS,
  buildEditorUrl,
  loadCustomTemplate,
  loadEditorId,
  saveCustomTemplate,
  saveEditorId,
} from '../lib/editors'
import type { Block, ResolvedFlowStop, Token, WordToken } from '../lib/types'
import './FlowStop.css'

/** Classify a unified-diff line for coloring. */
function diffLineClass(line: string): string {
  if (line.startsWith('@@')) return 'df-hunk'
  if (line.startsWith('+')) return 'df-add'
  if (line.startsWith('-')) return 'df-del'
  return 'df-ctx'
}

function DiffView({ text }: { text: string }) {
  if (!text.trim()) {
    return <div className="fs-diff-missing">(diff not resolved — hunk not found in git diff)</div>
  }
  // Hide the `@@ ... @@` hunk header — it's line-number noise; position lives in
  // the stepper and the target line in the "open in editor" link.
  const lines = text
    .replace(/\n$/, '')
    .split('\n')
    .filter((l) => !l.startsWith('@@'))
  return (
    <pre className="fs-diff">
      <code>
        {lines.map((line, i) => {
          const cls = diffLineClass(line)
          // Drop the leading +/-/space marker — add/del is shown by the tint +
          // gutter, so the glyph is just noise.
          return (
            <span key={i} className={`df-line ${cls}`}>
              {line.slice(1) || ' '}
            </span>
          )
        })}
      </code>
    </pre>
  )
}

/** Static markdown prose render. Words carry data-token-index so a future
 *  comment layer can anchor to them (mirrors SectionView's markup). */
function ProseView({ markdown }: { markdown: string }) {
  const { tokens, blocks } = useMemo(() => parseMarkdown(markdown), [markdown])
  if (blocks.length === 0) return null
  return (
    <div className="fs-prose">
      {blocks.map((b) => (
        <ProseBlock key={b.id} block={b} tokens={tokens} />
      ))}
    </div>
  )
}

function ProseBlock({ block, tokens }: { block: Block; tokens: Token[] }) {
  const node = block.node as { value?: string; lang?: string }
  if (block.type === 'code') {
    return (
      <pre className="fs-prose-code">
        <code>{node.value}</code>
      </pre>
    )
  }
  const words = tokens
    .slice(block.tokenStart, block.tokenEnd + 1)
    .filter((t): t is WordToken => t.kind === 'word')
  if (words.length === 0) return null
  const Tag = block.type === 'list' ? 'div' : block.type === 'blockquote' ? 'blockquote' : 'p'
  return (
    <Tag className={`fs-p ${block.type}`}>
      {words.map((w) => (
        <span key={w.index}>
          {w.breakBefore && <br />}
          <span
            data-token-index={w.index}
            className={w.emphasis.includes('strong') ? 'strong' : w.emphasis.includes('em') ? 'em' : ''}
          >
            {w.text}
          </span>{' '}
        </span>
      ))}
    </Tag>
  )
}

const LAYER_LABEL: Record<ResolvedFlowStop['layer'], string> = {
  flow: 'FLOW',
  foundation: 'FOUNDATION',
}

/** "Open in editor" CTA + a picker to choose which editor (persisted). */
function OpenInEditor({ absPath, line }: { absPath?: string; line?: number }) {
  const [editorId, setEditorId] = useState(loadEditorId)
  const [template, setTemplate] = useState(loadCustomTemplate)

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
    <div className="fs-open">
      {href ? (
        <a className="fs-open-cta" href={href} title={`${absPath}${line ? `:${line}` : ''}`}>
          Open in {label} ↗
        </a>
      ) : (
        <span className="fs-open-cta disabled" title={absPath ? 'Set a valid custom template' : 'No file path available'}>
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
  )
}

/** The hunk stepper — shown whenever a file has more than one hunk. */
function HunkNav({
  idx,
  count,
  onPrev,
  onNext,
}: {
  idx: number
  count: number
  onPrev: () => void
  onNext: () => void
}) {
  if (count <= 1) return null
  return (
    <div className="fs-hunk-nav">
      <button className="fs-hunk-btn" onClick={onPrev} title="Previous hunk (←)">
        ‹
      </button>
      <span className="fs-hunk-count">
        hunk {idx + 1} / {count}
      </span>
      <button className="fs-hunk-btn" onClick={onNext} title="Next hunk (→)">
        ›
      </button>
    </div>
  )
}

export default function FlowStop({
  stop,
  position,
  total,
  hunkIndex,
  minimal,
  calls,
  onNextHunk,
  onPrevHunk,
  onEnterFocus,
  onGotoStop,
}: {
  stop: ResolvedFlowStop
  position: number
  total: number
  hunkIndex: number
  minimal: boolean
  calls: ResolvedFlowStop[]
  onNextHunk: () => void
  onPrevHunk: () => void
  onEnterFocus: () => void
  onGotoStop: (id: string) => void
}) {
  const hunkCount = stop.hunks.length
  const idx = Math.min(hunkIndex, Math.max(0, hunkCount - 1))
  const hunk = stop.hunks[idx]

  // Minimal focus mode: one hunk, a compact location line, nothing else.
  if (minimal) {
    return (
      <div className="flow-stop minimal">
        <div className="fs-focus-loc">
          <span className="fs-focus-title">{stop.title}</span>
          <span className="fs-focus-file">{stop.file}</span>
        </div>
        <HunkNav idx={idx} count={hunkCount} onPrev={onPrevHunk} onNext={onNextHunk} />
        <DiffView text={hunk?.diffText ?? ''} />
      </div>
    )
  }

  return (
    <div className="flow-stop">
      <header className="fs-head">
        <span className={`fs-layer fs-layer-${stop.layer}`}>{LAYER_LABEL[stop.layer]}</span>
        <h2 className="fs-title">{stop.title}</h2>
        {stop.layer === 'flow' && total > 0 && (
          <span className="fs-step-count">
            {position + 1} / {total}
          </span>
        )}
      </header>
      <div className="fs-file">
        {stop.file}
        {stop.matchStatus === 'fuzzy' && <span className="fs-match fs-match-fuzzy">~ fuzzy match</span>}
        {stop.matchStatus === 'missing' && <span className="fs-match fs-match-missing">! no diff</span>}
      </div>
      {stop.oneLineSummary && <p className="fs-summary">{stop.oneLineSummary}</p>}

      <HunkNav idx={idx} count={hunkCount} onPrev={onPrevHunk} onNext={onNextHunk} />

      <DiffView text={hunk?.diffText ?? ''} />
      <ProseView markdown={stop.explanation} />

      {/* Action + flow CTAs live at the bottom, like the plan viewer. */}
      <div className="fs-footer">
        <div className="fs-actions">
          <OpenInEditor absPath={stop.absPath} line={hunk?.line} />
          <button className="fs-focus-cta" onClick={onEnterFocus} title="Focus this hunk (Enter)">
            Focus ⏎
          </button>
        </div>
        {calls.length > 0 && (
          <div className="fs-calls">
            <span className="fs-calls-label">calls into</span>
            {calls.map((c) => (
              <button key={c.id} className="fs-call-chip" onClick={() => onGotoStop(c.id)}>
                {c.title} →
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
