import './Reticle.css'

/** Fixed center crosshair: tick marks above and below the pivot point. */
export default function Reticle() {
  return (
    <div className="reticle" aria-hidden="true">
      <div className="reticle-line reticle-top" />
      <div className="reticle-line reticle-bottom" />
    </div>
  )
}
