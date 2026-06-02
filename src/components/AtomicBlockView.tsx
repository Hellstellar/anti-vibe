import { useReader } from '../store/readerStore'
import type { RootContent } from 'mdast'
import './AtomicBlockView.css'

/** Flatten any mdast node to its plain text content. */
function toText(node: any): string {
  if (!node) return ''
  if (typeof node.value === 'string') return node.value
  if (Array.isArray(node.children)) return node.children.map(toText).join('')
  return ''
}

function renderNode(node: RootContent, blockType: string) {
  switch (blockType) {
    case 'heading': {
      const depth = (node as any).depth ?? 2
      const Tag = `h${Math.min(depth, 6)}` as keyof JSX.IntrinsicElements
      return <Tag className="atomic-heading">{toText(node)}</Tag>
    }
    case 'code': {
      const lang = (node as any).lang as string | null
      return (
        <pre className="atomic-code">
          {lang && <span className="code-lang">{lang}</span>}
          <code>{(node as any).value}</code>
        </pre>
      )
    }
    case 'image': {
      // node is a paragraph whose child is an image (or an image itself).
      const img =
        (node as any).type === 'image'
          ? node
          : ((node as any).children ?? []).find((c: any) => c.type === 'image')
      if (!img) return null
      return (
        <figure className="atomic-image">
          <img src={img.url} alt={img.alt ?? ''} />
          {img.alt && <figcaption>{img.alt}</figcaption>}
        </figure>
      )
    }
    case 'table': {
      const rows = ((node as any).children ?? []) as any[]
      const [head, ...body] = rows
      return (
        <table className="atomic-table">
          {head && (
            <thead>
              <tr>
                {(head.children ?? []).map((cell: any, i: number) => (
                  <th key={i}>{toText(cell)}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {body.map((row: any, r: number) => (
              <tr key={r}>
                {(row.children ?? []).map((cell: any, c: number) => (
                  <td key={c}>{toText(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
    default:
      return null
  }
}

export default function AtomicBlockView() {
  const tokens = useReader((s) => s.tokens)
  const currentIndex = useReader((s) => s.currentIndex)
  const resumeFromAtomic = useReader((s) => s.resumeFromAtomic)

  const token = tokens[currentIndex]
  if (!token || token.kind !== 'atomic') return null

  return (
    <div className="atomic">
      <div className="atomic-tag">{token.blockType}</div>
      <div className="atomic-content">{renderNode(token.node, token.blockType)}</div>
      <button className="atomic-resume" onClick={() => resumeFromAtomic()}>
        ▸ resume &nbsp;(space)
      </button>
    </div>
  )
}
