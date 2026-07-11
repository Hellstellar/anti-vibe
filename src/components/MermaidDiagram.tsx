import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useReader } from '../store/readerStore'
import { mermaidThemeVariables } from '../lib/mermaid'
import type { DiagramWalkItem } from '../lib/types'
import './MermaidDiagram.css'

let renderSeq = 0

// Rendered-SVG cache, keyed by theme + source. Step mode remounts the unit
// body on every step (its re-animation key), so without this each walk stop
// would re-run mermaid's async render and flash the loading state.
const svgCache = new Map<string, string>()

/**
 * Render a ```mermaid fence as an SVG diagram, themed from the active theme's
 * CSS variables. Mermaid itself is imported lazily so documents without
 * diagrams never pay for the bundle. On any parse/render failure the caller's
 * `fallback` (the raw-code <pre>) is shown instead — bad diagram source
 * degrades to what we rendered before this feature existed.
 *
 * `highlight` (Step mode's diagram walk) lights one node/message, dims the
 * rest and zooms the camera onto it; if its SVG element can't be found the
 * diagram just shows undimmed. Sequence walks additionally pin the actor
 * header row on top so the columns stay identifiable while zoomed.
 *
 * `interactive` (step view) adds manual camera control: wheel/pinch zooms
 * around the cursor, drag pans, double-click resets to the step's frame.
 */
export default function MermaidDiagram({
  value,
  fallback,
  highlight,
  interactive,
}: {
  value: string
  fallback: ReactNode
  highlight?: DiagramWalkItem
  interactive?: boolean
}) {
  // Re-render on theme switch so the diagram palette tracks CRT/Cream live.
  const theme = useReader((s) => s.cfg.theme)
  const cacheKey = `${theme} ${value}`
  const [svg, setSvg] = useState<string | null>(svgCache.get(cacheKey) ?? null)
  const [failed, setFailed] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  const isSeqWalk = highlight?.type === 'seq-message' || highlight?.type === 'seq-note'

  useEffect(() => {
    const cached = svgCache.get(cacheKey)
    if (cached) {
      setSvg(cached)
      setFailed(false)
      return
    }
    let alive = true
    const id = `av-mermaid-${renderSeq++}`
    ;(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        // mermaid sizes node boxes by measuring label text — wait for the
        // theme's webfont, or boxes are sized to the fallback font's metrics
        // and the real font clips when it swaps in.
        await document.fonts.ready
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: mermaidThemeVariables(),
        })
        const out = await mermaid.render(id, value)
        svgCache.set(cacheKey, out.svg)
        if (alive) {
          setSvg(out.svg)
          setFailed(false)
        }
      } catch {
        // mermaid can leave a stray error element behind on failure
        document.getElementById(id)?.remove()
        document.getElementById(`d${id}`)?.remove()
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [cacheKey, value])

  // Apply the walk highlight to the injected SVG (and re-apply after any
  // re-render of the diagram), then zoom the camera onto the lit element —
  // on a large diagram a fit-to-screen walk stop would be unreadably small.
  useEffect(() => {
    const root = hostRef.current?.querySelector('svg')
    if (!root) return
    const { lit, context } = applyWalkHighlight(root, highlight)
    zoomTo(root, [...lit, ...context], highlight, barRef.current?.querySelector('svg'))
  }, [svg, highlight])

  // Manual camera: wheel zoom (cursor-anchored), drag pan, dblclick reset.
  useEffect(() => {
    const host = hostRef.current
    if (!interactive || !host || !svg) return

    const getSvg = () => host.querySelector('svg')
    const getBar = () => barRef.current?.querySelector('svg')
    let drag: { x: number; y: number } | null = null

    const onWheel = (e: WheelEvent) => {
      const el = getSvg()
      if (!el) return
      e.preventDefault()
      const vb = readViewBox(el)
      const orig = readViewBox(el, el.dataset.origViewBox)
      if (!vb || !orig) return
      const rect = el.getBoundingClientRect()
      const scale = Math.min(rect.width / vb.w, rect.height / vb.h)
      const offX = (rect.width - vb.w * scale) / 2
      // seq walk pins content to the top (xMidYMin) — no vertical letterbox
      const offY = el.getAttribute('preserveAspectRatio')?.includes('YMin')
        ? 0
        : (rect.height - vb.h * scale) / 2
      const ux = vb.x + (e.clientX - rect.left - offX) / scale
      const uy = vb.y + (e.clientY - rect.top - offY) / scale
      // pinch gestures arrive as ctrl+wheel with small deltas — amplify
      const factor = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.002))
      const w = Math.min(Math.max(vb.w * factor, orig.w / 12), orig.w)
      const r = w / vb.w
      const h = vb.h * r
      const x = clampPan(ux - (ux - vb.x) * r, orig.x, orig.x + orig.w - w)
      const y = clampPan(uy - (uy - vb.y) * r, orig.y, orig.y + orig.h - h)
      unlockSize(el)
      el.setAttribute('viewBox', `${x} ${y} ${w} ${h}`)
      syncBar(getBar(), x, w)
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      drag = { x: e.clientX, y: e.clientY }
      host.setPointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!drag) return
      const el = getSvg()
      const vb = el && readViewBox(el)
      const orig = el && readViewBox(el, el.dataset.origViewBox)
      if (!el || !vb || !orig) return
      const rect = el.getBoundingClientRect()
      const scale = Math.min(rect.width / vb.w, rect.height / vb.h)
      const x = clampPan(vb.x - (e.clientX - drag.x) / scale, orig.x, orig.x + orig.w - vb.w)
      const y = clampPan(vb.y - (e.clientY - drag.y) / scale, orig.y, orig.y + orig.h - vb.h)
      drag = { x: e.clientX, y: e.clientY }
      el.setAttribute('viewBox', `${x} ${y} ${vb.w} ${vb.h}`)
      syncBar(getBar(), x, vb.w)
    }
    const onPointerUp = (e: PointerEvent) => {
      drag = null
      if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId)
    }
    const onDblClick = () => {
      const el = getSvg()
      if (!el) return
      const frame = el.dataset.walkViewBox ?? el.dataset.origViewBox
      if (!frame) return
      if (frame === el.dataset.origViewBox) el.setAttribute('style', el.dataset.origStyle ?? '')
      else unlockSize(el)
      el.setAttribute('viewBox', frame)
      const f = readViewBox(el, frame)
      if (f) syncBar(getBar(), f.x, f.w)
    }

    host.addEventListener('wheel', onWheel, { passive: false })
    host.addEventListener('pointerdown', onPointerDown)
    host.addEventListener('pointermove', onPointerMove)
    host.addEventListener('pointerup', onPointerUp)
    host.addEventListener('pointercancel', onPointerUp)
    host.addEventListener('dblclick', onDblClick)
    return () => {
      host.removeEventListener('wheel', onWheel)
      host.removeEventListener('pointerdown', onPointerDown)
      host.removeEventListener('pointermove', onPointerMove)
      host.removeEventListener('pointerup', onPointerUp)
      host.removeEventListener('pointercancel', onPointerUp)
      host.removeEventListener('dblclick', onDblClick)
    }
  }, [interactive, svg])

  if (failed) return <>{fallback}</>
  if (!svg) return <div className="mermaid-loading">rendering diagram…</div>
  return (
    <div className={`mermaid-diagram${interactive ? ' interactive' : ''}`}>
      {isSeqWalk && (
        <div
          ref={barRef}
          className="mermaid-actorbar"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      <div
        ref={hostRef}
        className="mermaid-main"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  )
}

/* ------------------------------ camera ------------------------------ */

interface Box {
  x: number
  y: number
  w: number
  h: number
}

function readViewBox(el: SVGSVGElement, raw?: string | null): Box | null {
  const s = raw ?? el.getAttribute('viewBox')
  if (!s) return null
  const [x, y, w, h] = s.split(/[\s,]+/).map(Number)
  return w > 0 && h > 0 ? { x, y, w, h } : null
}

const clampPan = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), Math.max(lo, hi))

function unlockSize(el: SVGSVGElement): void {
  el.style.maxWidth = 'none'
  el.style.width = '100%'
  el.style.height = '100%'
}

/** Point the pinned actor bar at the same x-range as the main view so the
 *  columns line up. Its y-range (the actor strip) is fixed in its dataset. */
function syncBar(bar: SVGSVGElement | null | undefined, x: number, w: number): void {
  if (!bar?.dataset.strip) return
  const [top, h] = bar.dataset.strip.split(' ').map(Number)
  bar.setAttribute('viewBox', `${x} ${top} ${w} ${h}`)
}

/** Light the walk stop's element(s), dim every other steppable element.
 *  Returns the lit elements plus dimmed-but-relevant context (the lit node's
 *  incident edges) for the camera. Nothing matched => both empty, diagram
 *  left untouched. */
function applyWalkHighlight(
  svg: SVGSVGElement,
  walk?: DiagramWalkItem,
): { lit: Element[]; context: Element[] } {
  svg.querySelectorAll('.av-dim, .av-lit').forEach((el) => {
    el.classList.remove('av-dim', 'av-lit')
  })
  const none = { lit: [], context: [] }
  if (!walk) return none

  let dimmable: Element[] = []
  let lit: Element[] = []
  let context: Element[] = []

  if (walk.type === 'flow-node') {
    // flowchart nodes carry ids like "<renderId>-flowchart-<nodeId>-<n>"
    const nodes = [...svg.querySelectorAll('g.node')]
    const edges = [...svg.querySelectorAll('.edgePaths path')]
    dimmable = [...nodes, ...edges, ...svg.querySelectorAll('.edgeLabels .edgeLabel')]
    lit = nodes.filter((el) => {
      const m = el.id.match(/flowchart-(.+)-\d+$/)
      return m?.[1] === walk.id
    })
    // incident edges (ids "…L_<from>_<to>_<n>") stay dim but join the camera
    // frame, so both neighbour directions are visible as context
    context = edges.filter((el) => {
      const m = el.id.match(/L_(.+)_\d+$/)
      return (
        m != null &&
        (m[1].startsWith(`${walk.id}_`) || m[1].endsWith(`_${walk.id}`))
      )
    })
  } else {
    // sequence: messages are text.messageText + a messageLine path/line, in
    // matching document order; notes are .note shapes + text.noteText.
    const texts = [...svg.querySelectorAll('text.messageText')]
    const lines = [...svg.querySelectorAll('[class*="messageLine"]')]
    const noteShapes = [...svg.querySelectorAll('.note')]
    const noteTexts = [...svg.querySelectorAll('text.noteText')]
    dimmable = [...texts, ...lines, ...noteShapes, ...noteTexts]
    if (walk.type === 'seq-message') {
      lit = [texts[walk.index], lines[walk.index]].filter(Boolean)
    } else {
      lit = [noteShapes[walk.index], noteTexts[walk.index]].filter(Boolean)
    }
  }

  if (lit.length === 0) return none
  for (const el of dimmable) {
    if (!lit.includes(el)) el.classList.add('av-dim')
  }
  for (const el of lit) el.classList.add('av-lit')
  return { lit, context }
}

/**
 * Camera for the diagram walk: crop the SVG viewBox to the lit element(s)
 * plus context, so the current stop reads at full size on big diagrams. No
 * lit elements => restore the full (original) view. Coordinates are mapped
 * through client rects, so the CSS fit-to-container scaling doesn't matter.
 *
 * Sequence walks keep the full x-range (the message spans its actors) and
 * crop y only, starting below the actor header row — the `bar` SVG is then
 * pointed at that header strip, pinning the actors above the zoomed view.
 */
function zoomTo(
  svg: SVGSVGElement,
  lit: Element[],
  walk?: DiagramWalkItem,
  bar?: SVGSVGElement | null,
): void {
  const orig = svg.dataset.origViewBox ?? svg.getAttribute('viewBox') ?? ''
  if (!svg.dataset.origViewBox) {
    svg.dataset.origViewBox = orig
    // mermaid pins an inline max-width to the diagram's natural px width —
    // remember it so the un-zoomed view can be restored exactly.
    svg.dataset.origStyle = svg.getAttribute('style') ?? ''
  }
  if (!orig) return
  const vb = readViewBox(svg, orig)
  if (!vb) return

  // Always measure against the full view (a re-run on an already-zoomed SVG
  // would otherwise map client rects through the wrong frame).
  svg.setAttribute('viewBox', orig)
  svg.setAttribute('style', svg.dataset.origStyle ?? '')
  svg.removeAttribute('preserveAspectRatio')
  delete svg.dataset.walkViewBox
  if (lit.length === 0) return

  const svgRect = svg.getBoundingClientRect()
  if (svgRect.width === 0 || svgRect.height === 0) return
  // client px -> viewBox units ('meet' keeps scale uniform on both axes)
  const scale = Math.min(svgRect.width / vb.w, svgRect.height / vb.h)
  const offX = (svgRect.width - vb.w * scale) / 2
  const offY = (svgRect.height - vb.h * scale) / 2
  const toUser = (r: DOMRect): Box => ({
    x: vb.x + (r.left - svgRect.left - offX) / scale,
    y: vb.y + (r.top - svgRect.top - offY) / scale,
    w: r.width / scale,
    h: r.height / scale,
  })

  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const el of lit) {
    const b = toUser(el.getBoundingClientRect())
    left = Math.min(left, b.x)
    top = Math.min(top, b.y)
    right = Math.max(right, b.x + b.w)
    bottom = Math.max(bottom, b.y + b.h)
  }
  const bw = right - left
  const bh = bottom - top

  let frame: Box
  if (walk && walk.type !== 'flow-node') {
    // ---- sequence: full width, y-crop below the pinned actor header ----
    const actorBottom = actorStrip(svg, toUser, bar)
    const minY = actorBottom ?? vb.y
    let h = Math.min(Math.max(bh * 5, vb.h * 0.25), vb.y + vb.h - minY)
    // grow the frame toward the stage's aspect so the view fills it (more
    // downstream context) instead of letterboxing into a floating strip
    const stage = svg.parentElement?.getBoundingClientRect()
    if (stage && stage.width > 0) {
      const needH = vb.w * (stage.height / stage.width)
      if (needH > h) h = Math.min(needH, vb.y + vb.h - minY)
    }
    const y = clampPan(top + bh / 2 - h / 2, minY, vb.y + vb.h - h)
    frame = { x: vb.x, y, w: vb.w, h }
    // any residual letterbox hugs the actor bar instead of centering
    svg.setAttribute('preserveAspectRatio', 'xMidYMin meet')
  } else {
    // ---- flowchart: frame the node + incident edges with context ----
    const PAD = 2.8
    const w = Math.min(bw * PAD, vb.w)
    const h = Math.min(bh * PAD, vb.h)
    frame = {
      x: clampPan(left + bw / 2 - w / 2, vb.x, vb.x + vb.w - w),
      y: clampPan(top + bh / 2 - h / 2, vb.y, vb.y + vb.h - h),
      w,
      h,
    }
  }

  svg.setAttribute('viewBox', `${frame.x} ${frame.y} ${frame.w} ${frame.h}`)
  svg.dataset.walkViewBox = `${frame.x} ${frame.y} ${frame.w} ${frame.h}`
  // Unlock mermaid's natural-width cap while zoomed, so the cropped view can
  // actually grow to fill the stage (restored above for the overview).
  unlockSize(svg)
  syncBar(bar, frame.x, frame.w)
}

/** Locate the top actor header row, point the bar SVG at that strip, and
 *  return the strip's bottom edge (in viewBox units). No actors => null. */
function actorStrip(
  svg: SVGSVGElement,
  toUser: (r: DOMRect) => Box,
  bar?: SVGSVGElement | null,
): number | null {
  const actors = [...svg.querySelectorAll('rect.actor, .actor')]
  if (actors.length === 0) return null
  const boxes = actors.map((el) => toUser(el.getBoundingClientRect()))
  const rowTop = Math.min(...boxes.map((b) => b.y))
  // the header row: actors starting near the top (mirrored copies sit at the
  // bottom of the diagram and must not stretch the strip)
  const row = boxes.filter((b) => b.y < rowTop + 1)
  const rowBottom = Math.max(...row.map((b) => b.y + b.h))
  if (bar) {
    // generous pad so 'slice' rounding can never shave the box borders
    const pad = 8
    const stripH = rowBottom - rowTop + pad * 2
    bar.dataset.strip = `${rowTop - pad} ${stripH}`
    // Fixed height (the strip's natural size at full diagram width) plus
    // 'slice' scaling: when the main view x-zooms, the bar viewBox narrows
    // with it and slice keeps the scale width-driven on both SVGs, so the
    // actor columns stay pixel-aligned at any zoom.
    const vb = readViewBox(svg, svg.dataset.origViewBox)
    const boxW = bar.parentElement?.getBoundingClientRect().width ?? 0
    if (vb && boxW > 0) {
      bar.setAttribute('preserveAspectRatio', 'xMidYMid slice')
      bar.style.maxWidth = 'none'
      bar.style.width = '100%'
      bar.style.height = `${(boxW * stripH) / vb.w}px`
    }
  }
  return rowBottom + 2
}
