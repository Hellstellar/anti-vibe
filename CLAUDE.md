# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Fixate is a retro-cyberpunk **RSVP reader** for reviewing LLM/agent markdown output without fatigue. You move through a document heading-by-heading, reveal a section, optionally speed-read it (RSVP: one word flashed at a time with an ORP pivot), or step through it one sentence/list-item/table-row at a time. Single-page Vite + React + TypeScript app, no backend.

## Commands

```bash
npm run dev          # Vite dev server, auto-opens http://localhost:5173
npm run build        # tsc -b (typecheck all project refs) then vite build -> dist/
npm run typecheck    # tsc -b --noEmit
npm test             # vitest run (once)
npm run test:watch   # vitest watch
npx vitest run src/lib/timing.test.ts   # single test file
npx vitest run -t "ramp"                 # single test by name
```

Tests run in the **node** environment (see `vite.config.ts` `test.environment`), not jsdom — so unit tests cover only the pure logic in `src/lib/` (no DOM, no React rendering). There is no lint config; `tsc` is the only static check.

## Architecture

The whole app is a state machine over one immutable data structure produced at load time.

### Parse once into a flat token stream (`src/lib/parseMarkdown.ts`)

Markdown → mdast (unified/remark + remark-gfm) → three parallel arrays, the single source of truth for everything downstream:

- **`tokens: Token[]`** — a flat stream of either `WordToken` (one display word, carries emphasis/list flags, soft-break flag) or `AtomicToken` (heading/code/table/image, rendered as-is and auto-pauses RSVP). Two indices matter and are easy to confuse:
  - `index` — position in the full token stream (counts atomics).
  - `wordIndex` — ordinal among **word tokens only**; this drives the WPM ramp.
- **`blocks: Block[]`** — top-level source blocks, each with an inclusive `[tokenStart, tokenEnd]` range. Used to render surrounding context and to bound chunking to a single block.
- **`sections: Section[]`** — blocks grouped by heading (a heading starts a new section; leading content before the first heading becomes a titleless section). Navigation and RSVP are bounded by a section's token range.

`emitNode` recurses into lists and blockquotes so nested code/tables/headings/images aren't dropped. Line breaks are tracked via `pendingBreak`/`pendingListStart` flags that the next emitted word claims.

### State machine (`src/store/readerStore.ts`)

A single Zustand store holds all reader state and is the only place modes change. Modes: `idle` → `countdown` → `section` → `playing` → `stepping`.

- The RSVP playback loop is a **self-rescheduling `setTimeout`** (`scheduleNext`), with the timer handle kept in a **module-level variable outside React/store state** so it survives re-renders. Always `clearTimer()` before changing mode. The loop is bounded to the current section and stops back to the reading view at the section end or any atomic token.
- `rampStart` is the `wordIndex` where the current play session began; per-word timing measures offset from it, so playback eases in again on every (re)start/resume.
- Config (`ReaderConfig`) is persisted to `localStorage` under key `fixate-config`, and **`sanitizeConfig` clamps it on every load/set** (guards corrupted/hand-edited values, keeps `startWpm <= targetWpm`).

### Pure timing/chunking/stepping logic (`src/lib/`)

- `timing.ts` — `pivotIndex`/`splitPivot` (Spritz-style ORP letter), `wpmAt` (quadratic ease-in ramp), `wordDelay` (base WPM dwell × length & punctuation multipliers). `DEFAULT_CONFIG` lives here.
- `chunk.ts` — `chunkAt` gathers up to `chunkSize` contiguous word tokens within one block; `chunkDelay` sums member word delays using ramp offset.
- `steps.ts` — `buildSteps` turns a section into Step-mode units (sentence per `.!?`, one per list item, one per table body row, code/image/quote atomics).

These four (`timing`, `chunk`, `steps`, `parseMarkdown`) are the only tested files; keep them pure so they stay testable in the node env.

### Components (`src/components/`)

`App.tsx` shows `LandingView` (paste / open `.md`) until content loads, then `ReaderView`. **`ReaderView.tsx` is the keyboard router** — it owns the global keydown handler and dispatches to store actions based on the current mode, then renders one of `Countdown` / `RsvpStage` / `SectionView` / `StepView`. Styling is per-component CSS files plus `theme.css` (CRT/pixel theme; reading font is the `--word-font` CSS variable).

Sound (`src/lib/sfx.ts`) is synthesized with the Web Audio API (no audio files). `App.tsx` subscribes to the store and fires SFX on meaningful transitions; all audio calls are no-ops when disabled and swallow failures.

### The interaction model (central, spans store + ReaderView)

One axis of focus, deepening with Enter: `enter` fixate deeper (heading → reveal → step → next unit) · `shift+enter` step back · `cmd/ctrl+enter` RSVP the section from its start · `space` pause/resume RSVP · `esc` up one level (never to landing — the ✕ button exits). Arrows are **contextual** (heading list moves between headings; reading view scrolls; step mode moves between units), and `cmd/ctrl+arrow` jumps across sections. Clicking a word in the reading view starts RSVP from there (after the Ready/Set/Fixate countdown). When changing this behavior, the keydown handler in `ReaderView.tsx` and the corresponding store actions must stay in sync.
