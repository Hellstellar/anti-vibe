import { useFlow } from '../store/flowStore'
import { openReview } from '../bridge/receiver'
import './ReviewSwitcher.css'

/** Relative "3m ago" / "2h ago" / date, from an epoch ms timestamp. */
function ago(ts: number): string {
  if (!ts) return ''
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(ts).toLocaleDateString()
}

export default function ReviewSwitcher() {
  const reviews = useFlow((s) => s.reviews)
  const currentId = useFlow((s) => s.documentId)

  // Nothing to switch between — hide the panel entirely.
  if (reviews.length <= 1) return null

  return (
    <div className="review-switcher">
      <div className="rs-head">REVIEWS · {reviews.length}</div>
      <ul className="rs-list">
        {reviews.map((r) => (
          <li key={r.documentId}>
            <button
              className={`rs-item${r.documentId === currentId ? ' active' : ''}`}
              onClick={() => openReview(r.documentId)}
              title={r.title}
            >
              <span className="rs-title">{r.title || 'Untitled review'}</span>
              <span className="rs-meta">
                {r.stopCount} stop{r.stopCount === 1 ? '' : 's'} · {ago(r.createdAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
