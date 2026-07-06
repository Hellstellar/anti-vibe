import { useEffect, useState, type ReactNode } from 'react'
import { useReader } from '../store/readerStore'
import { mermaidThemeVariables } from '../lib/mermaid'
import './MermaidDiagram.css'

let renderSeq = 0

/**
 * Render a ```mermaid fence as an SVG diagram, themed from the active theme's
 * CSS variables. Mermaid itself is imported lazily so documents without
 * diagrams never pay for the bundle. On any parse/render failure the caller's
 * `fallback` (the raw-code <pre>) is shown instead — bad diagram source
 * degrades to what we rendered before this feature existed.
 */
export default function MermaidDiagram({
  value,
  fallback,
}: {
  value: string
  fallback: ReactNode
}) {
  // Re-render on theme switch so the diagram palette tracks CRT/Cream live.
  const theme = useReader((s) => s.cfg.theme)
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const id = `av-mermaid-${renderSeq++}`
    ;(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: mermaidThemeVariables(),
        })
        const out = await mermaid.render(id, value)
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
  }, [value, theme])

  if (failed) return <>{fallback}</>
  if (!svg) return <div className="mermaid-loading">rendering diagram…</div>
  return (
    <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
  )
}
