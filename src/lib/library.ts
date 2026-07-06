// Client-side persistence for the document library — the 'local' source (paste
// / open .md). Bridge-pushed docs persist server-side (bridge disk); these
// persist in localStorage so they survive reloads and work on the deployed web
// app, where there is no bridge. Bounded to MAX_LOCAL (oldest evicted), mirroring
// the bridge's cap. Pure of React; tolerates unavailable/blocked storage.

import type { LibraryDoc } from './types'

const LIB_KEY = 'antivibe-library'

/** Cap on retained local docs (mirrors the bridge's MAX_DOCS). */
export const MAX_LOCAL = 20

/** Restore persisted local docs (oldest first). Tolerates missing/corrupt blobs. */
export function restoreLocalLibrary(): LibraryDoc[] {
  try {
    const raw = localStorage.getItem(LIB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        // Guard against pre-`source` blobs and hand-edited junk.
        return (parsed as LibraryDoc[])
          .filter((d) => d && typeof d.markdown === 'string' && typeof d.documentId === 'string')
          .map((d) => ({ ...d, source: 'local' as const }))
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

/** Persist the local docs from a mixed library (bridge docs are skipped —
 *  they live on the bridge). Silently no-ops if storage is unavailable. */
export function persistLocalLibrary(library: LibraryDoc[]): void {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(library.filter((d) => d.source === 'local')))
  } catch {
    /* ignore */
  }
}

/** Derive a display title from markdown: first heading, else first non-empty
 *  line (trimmed), else 'Untitled'. Mirrors the bridge's title fallback. */
export function deriveTitle(src: string): string {
  const heading = src.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m)
  if (heading) return heading[1].trim()
  const line = src.split('\n').find((l) => l.trim())
  return line ? line.trim().slice(0, 80) : 'Untitled'
}
