# Code Review — Deferred Findings

From the `/code-review xhigh` pass on the MVP. **#1–#7 are fixed** (see commit);
**#8 (list image-only)** was also fixed by the parser `emitNode` refactor. The
items below are deferred for a later pass, roughly severity-ordered.

## Open

### 9. Multi-word chunk styling/pivot (chunkSize > 1)
`RsvpStage` styles the flash with only `chunk.words[0].emphasis`, and
`splitPivot` runs over the space-joined chunk text, so for `chunkSize > 1`
mixed-emphasis words render un-styled and the red pivot can land on the wrong
word. Default `chunkSize = 1` avoids it. Fix: style each word span in the chunk
from its own `emphasis`; decide pivot rule for multi-word (e.g. pivot the middle
word, or center the whole chunk).

### 10. Committed `*.tsbuildinfo`
`tsconfig.app.tsbuildinfo` and `tsconfig.node.tsbuildinfo` are tracked in git →
spurious diffs / stale-cache skips. Fix: add `*.tsbuildinfo` to `.gitignore`
and `git rm --cached` both.

### 11. Untrusted `<img src>` in atomic image blocks
`AtomicBlockView` renders `img.url` verbatim from pasted markdown — a
tracking-beacon/SSRF-style outbound request fires when the block is shown (not
XSS; no `dangerouslySetInnerHTML` anywhere). Fix: allow-list `http(s)`/`data:`
schemes, or set a CSP.

### 12. Module-level `timer` + HMR (dev-only)
`let timer` in `readerStore.ts` is shared across module instances; under Vite
HMR an orphaned `setTimeout` from a prior instance can keep advancing
`currentIndex` and can't be cleared. Production (single eval) is unaffected.
Fix: store the handle in the Zustand state, or clear on HMR dispose.

### 13. Leaked rAF on PauseSpotlight unmount
`onMouseMove` schedules a `requestAnimationFrame` never cancelled on unmount; a
pending frame fires `setProperty` on a detached node after resume. Fix: cleanup
effect calling `cancelAnimationFrame(rafRef.current)`.

### 14. Dead store state `spotlight` / `setSpotlight`
Defined, initialized, persisted, never read or called (PauseSpotlight uses local
CSS vars). Fix: remove both from the store + `ReaderState`.

### 15. Stale clipboard error in LandingView fallback
The `error` string is only cleared at the top of `pasteAndRead`; the fallback
`READ` button never clears it, so a prior "Clipboard is empty" message lingers.
Fix: clear `error` when entering fallback / on the fallback READ click.

## Lower priority (cut from the top-15)

- **Forced reflow per flash** — `RsvpStage` measure effect does write→read
  `getBoundingClientRect`→write each word; at high WPM this defeats batching.
  Consider measuring once and caching per word width, or the monospace `ch`-math
  fast path.
- **`chunkDelay` recomputes regexes on the hot path** — punctuation/length
  factors depend only on the immutable token; precompute per `WordToken` at
  parse time, leaving only the cfg-dependent base delay per call.
- **`onMove` drops latest cursor coords** — bails if a frame is pending, using
  the first event's coords; store latest x/y in a ref and read inside the rAF.
- **`resumeAt(index)` lacks a range/word guard** — a non-numeric or
  out-of-range index yields `NaN`/blank reader. Currently unreachable (clicks
  resolve to valid word spans), but worth a clamp + word check.
- **`tsconfig.app.json` includes `*.test.ts`** — couples `npm run build` to test
  correctness (tests are not bundled). Split a test tsconfig or `exclude`.
- **Whole list → one block** (MVP simplification) — `chunkSize > 1` can merge
  words across adjacent list items into one flash; pause renders the whole list
  as one context block. Consider one block per list item.
- **Pure-punctuation tokens** (`--`, `***`, inline-code `=`) get `clean === ''`
  and a full flash + dwell. Consider merging into the neighbor or skipping.
- **Cleanup dups** — `splitPivot` re-strips the alphanumeric regex that `clean()`
  already applies (and `token.clean` already holds); the `cls` class-builder is
  duplicated in `RsvpStage`/`PauseSpotlight` with divergent names; the
  `text`/`inlineCode` switch cases in `walkInline` are byte-identical.
- **`main.tsx` `getElementById('root')!`** — non-null assertion crashes hard if
  `#root` is absent; low likelihood.
- **Google Fonts `@import`** — offline/CSP leaves the generic monospace
  fallback; self-host fonts if offline support matters.
