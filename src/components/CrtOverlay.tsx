/** Fixed ambient overlay; its look (CRT scanlines vs. soft vignette) is
 *  driven entirely by the active [data-theme] in theme.css. */
export default function CrtOverlay() {
  return <div className="crt-overlay" aria-hidden="true" />
}
