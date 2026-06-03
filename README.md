# RSVP READER

A retro-cyberpunk **speed-reader for reviewing LLM / agent output**. Paste markdown, and it flashes the text one word at a time — fixed in the center of the screen, pivot letter highlighted — so the content moves instead of your eyes.

> **RSVP** (Rapid Serial Visual Presentation) shows information one item at a time in the same spot. Instead of reading a paragraph at your own pace, words flash by in the center of your vision. It's speed-reading where the content moves, not your gaze — making it easier to process info without scrolling or moving your eyes around.

## Why

LLMs and agents generate walls of text. Skimming it is slow and tiring. This app lets you move through generated markdown section by section, glance at a focus-sized preview of each, and speed-read the parts worth it on demand by clicking a word.

## Features

- **Load** — paste markdown from the clipboard, or open a `.md` file.
- **Section navigation** — the doc is split into heading-delimited sections. You land on a heading; **Enter** reveals a focus-sized preview of its content, **Enter** again moves to the next section, **Shift+Enter** goes back. Skim heading-to-heading without reading everything.
- **Opt-in RSVP** — when a section looks worth speed-reading, **click any word** and RSVP plays that section from there. Words flash centered with the ORP/pivot letter pinned to a reticle; speed ramps from slow to your target WPM (and re-ramps on each start). `space` pauses back to the reading view.
- **CRT reading view** — a revealed section shows in full inside a scrollable pane that dissolves toward the top and bottom edges (CRT-style fade). Scroll with the arrow keys.
- **Markdown-aware** — headings, lists, blockquotes, fenced code, tables, and images render as styled markdown; prose centered, list items bulleted, line breaks preserved.
- **Configurable** — target/start WPM and words-per-flash (saved to localStorage; settings reachable from the landing page and the reader).
- **Keyboard** — `enter` reveal / next section · `shift+enter` previous · `↑`/`↓` scroll (or skip headings when collapsed) · `space` play/pause RSVP · `esc` exit.
- **Theme** — retro-cyberpunk pixelated: dark warm palette, red/orange accents, pixel fonts, CRT scanlines. The reading font is swappable via the `--word-font` CSS variable.

## Run

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`. Copy some markdown and click **PASTE & READ**, or **OPEN .MD FILE**.

### Tests

```bash
npm test          # run unit tests once (Vitest)
npm run test:watch
```

Unit tests cover the pure logic: ORP pivot + WPM ramp + per-word timing (`timing.ts`), chunk gathering (`chunk.ts`), and the markdown → token-stream parse (`parseMarkdown.ts`).

> Clipboard access needs a secure context. On `localhost` it works; if the browser blocks it, the app falls back to a paste box.

## Stack

Vite · React · TypeScript · [unified](https://unifiedjs.com/) / remark (markdown AST) · Zustand (playback state).

## Architecture

Markdown is parsed once (`src/lib/parseMarkdown.ts`) into a flat **token stream** with a global index — word tokens and atomic-block tokens. That index is the single source of truth linking RSVP playback to click-to-resume in the pause view. The playback loop is a self-rescheduling `setTimeout` in a Zustand store (`src/store/readerStore.ts`); per-word timing lives in `src/lib/timing.ts`.

## Roadmap

- Global hotkey to capture selected text from any app (beyond clipboard paste).
- Sound effects on list items and section changes.
- Non-markdown / plain-text and HTML input.
- Customizable fonts and themes in-app.
- More pause-mode controls (rewind by sentence, bookmarks).

## License

MIT — see [LICENSE](./LICENSE).
