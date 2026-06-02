# RSVP READER

A retro-cyberpunk **speed-reader for reviewing LLM / agent output**. Paste markdown, and it flashes the text one word at a time — fixed in the center of the screen, pivot letter highlighted — so the content moves instead of your eyes.

> **RSVP** (Rapid Serial Visual Presentation) shows information one item at a time in the same spot. Instead of reading a paragraph at your own pace, words flash by in the center of your vision. It's speed-reading where the content moves, not your gaze — making it easier to process info without scrolling or moving your eyes around.

## Why

LLMs and agents generate walls of text. Skimming it is slow and tiring. This app lets you blast through generated markdown fast, and **pause anytime** to drop into a focused spotlight view of the surrounding text — then resume from any word.

## Features (MVP)

- **Paste & read** — one button reads markdown from your clipboard.
- **RSVP playback** — words flash centered; the ORP/pivot letter is highlighted in red and pinned to a fixed reticle.
- **Speed ramp** — starts slow, accelerates to your target WPM; long words and punctuation get extra dwell time. Live `wpm` readout.
- **Pause spotlight** — pause and the surrounding paragraph appears as flowing text under a moving radial spotlight; the cursor is the light source, everything else fades. **Click any word to resume from there.**
- **Markdown-aware** — headings, fenced code, tables, and images are **auto-pause points**, rendered as-is. List items flash with a distinct animation.
- **Configurable** — target WPM, start WPM, and words-per-flash (saved to localStorage).
- **Keyboard** — `space` pause/resume · `←` / `→` step a word · `esc` exit.
- **Theme** — retro-cyberpunk pixelated: dark warm palette, red/orange accents, pixel fonts, CRT scanlines. The reading font is swappable via the `--word-font` CSS variable.

## Run

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`. Copy some markdown, click **PASTE & READ**.

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
