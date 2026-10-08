import { create } from 'zustand'
import { parseMarkdown } from '../lib/parseMarkdown'
import { chunkAt, chunkDelay } from '../lib/chunk'
import { buildSteps } from '../lib/steps'
import { DEFAULT_CONFIG } from '../lib/timing'
import {
  isThemeId,
  isTextAlign,
  isSymbolMode,
  defaultAlignFor,
  alignForThemeSwitch,
  DEFAULT_THEME,
} from '../lib/theme'
import { CFG_KEY } from '../lib/storageKeys'
import { docKeyFor, persistComments, restoreComments } from '../lib/comments'
import { restoreLocalLibrary, persistLocalLibrary, deriveTitle } from '../lib/library'
import type {
  Block,
  Comment,
  LibraryDoc,
  ReaderConfig,
  ReaderMode,
  Section,
  StepUnit,
  Token,
} from '../lib/types'

/** Coerce a value to a finite number, falling back when NaN/Infinity/missing. */
function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Clamp config into a safe, self-consistent range. Guards against corrupted or
 * hand-edited localStorage (e.g. targetWpm 0/NaN -> Infinity delay) and keeps
 * startWpm <= targetWpm so the ramp always accelerates rather than decelerates.
 */
function sanitizeConfig(cfg: ReaderConfig): ReaderConfig {
  const targetWpm = Math.max(10, num(cfg.targetWpm, DEFAULT_CONFIG.targetWpm))
  const startWpm = Math.min(
    targetWpm,
    Math.max(10, num(cfg.startWpm, DEFAULT_CONFIG.startWpm)),
  )
  const theme = isThemeId(cfg.theme) ? cfg.theme : DEFAULT_THEME
  return {
    ...cfg,
    startWpm,
    targetWpm,
    rampWords: Math.max(0, Math.round(num(cfg.rampWords, DEFAULT_CONFIG.rampWords))),
    chunkSize: Math.max(1, Math.round(num(cfg.chunkSize, DEFAULT_CONFIG.chunkSize))),
    soundOn: typeof cfg.soundOn === 'boolean' ? cfg.soundOn : DEFAULT_CONFIG.soundOn,
    theme,
    align: isTextAlign(cfg.align) ? cfg.align : defaultAlignFor(theme),
    symbols: isSymbolMode(cfg.symbols) ? cfg.symbols : DEFAULT_CONFIG.symbols,
  }
}

function loadConfig(): ReaderConfig {
  try {
    const raw = localStorage.getItem(CFG_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return sanitizeConfig({
        ...DEFAULT_CONFIG,
        ...parsed,
        // Pass the raw align through (undefined for blobs saved before this
        // field existed) so sanitizeConfig falls back to the theme's default
        // instead of DEFAULT_CONFIG.align masking it.
        align: parsed.align,
        multipliers: { ...DEFAULT_CONFIG.multipliers, ...parsed.multipliers },
      })
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_CONFIG
}

function saveConfig(cfg: ReaderConfig) {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
  } catch {
    /* ignore */
  }
}

/** Cap per source (bridge / local), mirroring each backend's own cap. */
const MAX_LIBRARY = 20

/** Trim a same-source list to MAX_LIBRARY, evicting oldest first but never the
 *  active doc (input oldest-first, so it drops from the front). */
function capSource(list: LibraryDoc[], activeId: string | null): LibraryDoc[] {
  if (list.length <= MAX_LIBRARY) return list
  let excess = list.length - MAX_LIBRARY
  return list.filter((d) => {
    if (excess > 0 && d.documentId !== activeId) {
      excess--
      return false
    }
    return true
  })
}

/** Cap bridge and local docs independently, then re-order oldest-first by
 *  arrival so the overlay's newest-first view stays correct. */
function capLibrary(lib: LibraryDoc[], activeId: string | null): LibraryDoc[] {
  const local = capSource(lib.filter((d) => d.source === 'local'), activeId)
  const bridge = capSource(lib.filter((d) => d.source === 'bridge'), activeId)
  return [...local, ...bridge].sort((a, b) => a.createdAt - b.createdAt)
}

// Timer handle lives outside React/store state so it survives re-renders.
let timer: ReturnType<typeof setTimeout> | null = null
function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

interface ReaderState {
  tokens: Token[]
  blocks: Block[]
  sections: Section[]
  /** RSVP cursor: token index of the current chunk's first word. */
  currentIndex: number
  /** Index into sections[] of the section being read. */
  currentSection: number
  /** Whether the current section's content is revealed (vs heading-only). */
  revealed: boolean
  mode: ReaderMode
  /** True when RSVP is frozen mid-section (space while mode is 'playing').
   *  Pausing stays in 'playing' — it never drops to the reading view, so the
   *  RSVP stage (and its scrub preview) stays on screen. */
  paused: boolean
  cfg: ReaderConfig
  /** wordIndex where the current RSVP session began — the ramp eases in
   *  from here, so every (re)start eases in slowly. */
  rampStart: number
  /** Step-mode units for the current section + cursor. */
  stepUnits: StepUnit[]
  stepIndex: number
  /** Token index queued to RSVP after the Ready/Set/Focus countdown. */
  pendingRsvp: number | null

  /** Raw source of the loaded document, retained for anchor quoting and
   *  marker export (parseMarkdown otherwise discards it). */
  src: string
  /** Stable identity the current doc's comments persist under. */
  docKey: string
  /** Document title, if the loader supplied one (bridge path). */
  docTitle: string
  /** Review comments for the loaded document. */
  comments: Comment[]
  /** Every document received from the bridge this session, oldest first. Each
   *  push is retained as its own entry so the reader can navigate between them
   *  instead of each new push clobbering the last. */
  library: LibraryDoc[]
  /** documentId of the currently-loaded doc (null for landing paste/file). */
  activeDocId: string | null
  /** Whether the document-library overlay is open. */
  libraryOpen: boolean

  load: (src: string, meta?: { documentId?: string; title?: string }) => void
  /** Load a pasted / opened `.md` doc AND retain it in the client-persisted
   *  library (source 'local'), so paste/open/push share one resumable library. */
  loadLocal: (src: string, title?: string) => void
  exit: () => void
  startCountdown: () => void
  /** Enter the section reading view (called when the countdown finishes). */
  enterReading: () => void
  /** Enter key: reveal the current section, or advance to the next one. */
  enterKey: () => void
  nextSection: () => void
  prevSection: () => void
  /** Select a heading without revealing it (arrow keys, or scrolling the
   *  heading list to a new row settling it as current). */
  selectSection: (idx: number) => void
  /** Go to a section and reveal it (used by hold-to-advance). */
  gotoSectionRevealed: (idx: number) => void
  /** Start RSVP for the current section from token `index` (runs the
   *  Ready/Set/Focus countdown first). */
  rsvpFrom: (index: number) => void
  /** Called when the pre-RSVP countdown finishes — begins playback. */
  beginRsvp: () => void
  /** Space: pause/resume RSVP (in place), or start it for the revealed section. */
  toggleRsvp: () => void
  /** While paused, move the frozen cursor one word back/forward (scrub preview). */
  rsvpNudge: (delta: 1 | -1) => void
  /** While paused, jump the frozen cursor to `index` (tap a word in the scrub preview). */
  rsvpSeek: (index: number) => void
  startStepping: () => void
  stepNext: () => void
  stepPrev: () => void
  /** Enter: focus one level deeper (heading -> reveal -> step -> next unit). */
  focusDeeper: () => void
  /** Cmd/Ctrl+Enter: RSVP the current section from its first word, any level. */
  rsvpSection: () => void
  /** RSVP CTA: start from wherever the reader last selected a word (or the
   *  section start, the default cursor position). */
  rsvpHere: () => void
  /** Reading view: click a word to move the cursor there — no mode change,
   *  just marks where RSVP/step-through starts from next. */
  selectWord: (index: number) => void
  /** Esc: up one level (RSVP/step -> reading -> heading). Never to landing. */
  goBack: () => void
  setCfg: (partial: Partial<ReaderConfig>) => void

  /** Add a comment; returns its id. */
  addComment: (c: Omit<Comment, 'id' | 'createdAt' | 'resolved'>) => string
  /** Edit a comment's body. */
  updateComment: (id: string, body: string) => void
  /** Remove a comment. */
  removeComment: (id: string) => void
  /** Mark a comment resolved/unresolved. */
  resolveComment: (id: string, resolved: boolean) => void
  /** Drop all comments for the current document. */
  clearComments: () => void

  /** Add a bridge-pushed doc to the library. `foreground` (decided by the bridge
   *  receiver) opens it now; otherwise it's appended silently (unread badge) so
   *  the human is never yanked off what they're reading. Deduped by documentId,
   *  so SSE replay on (re)connect is idempotent and never re-opens a doc. */
  receiveDoc: (
    doc: { documentId: string; markdown: string; title?: string; createdAt?: number },
    foreground: boolean,
  ) => void
  /** Load a library doc by id, restoring its own comments. */
  switchTo: (documentId: string) => void
  /** Open the library overlay (no-op when the library is empty). */
  openLibrary: () => void
  /** Close the library overlay. */
  closeLibrary: () => void
  /** Toggle the library overlay. */
  toggleLibrary: () => void
}

export const useReader = create<ReaderState>((set, get) => {
  /** Nearest word-token index at/after `from` within [lo, hi], or null. */
  const wordAtOrAfter = (from: number, hi: number): number | null => {
    const { tokens } = get()
    for (let i = from; i <= hi && i < tokens.length; i++) {
      if (tokens[i].kind === 'word') return i
    }
    return null
  }

  /** Nearest word-token index at/before `from` within [lo, hi], or null. */
  const wordAtOrBefore = (from: number, lo: number): number | null => {
    const { tokens } = get()
    for (let i = from; i >= lo && i >= 0; i--) {
      if (tokens[i].kind === 'word') return i
    }
    return null
  }

  /** Which step unit covers token `index` — an exact word match if the unit
   *  carries words (sentence/listItem/quote), else the first unit from the
   *  same source block (code/image/tableRow, or a word whose unit lacks a
   *  words array). Falls back to the first unit. */
  const stepIndexForCursor = (units: StepUnit[], tokens: Token[], index: number): number => {
    const cur = tokens[index]
    if (!cur) return 0
    const wordMatch = units.findIndex((u) => u.words?.some((w) => w.index === index))
    if (wordMatch !== -1) return wordMatch
    const blockMatch = units.findIndex((u) => u.groupId === cur.blockId)
    return blockMatch !== -1 ? blockMatch : 0
  }

  /** wordIndex to ramp from for an RSVP session starting at token `idx`. */
  const rampOriginAt = (idx: number): number => {
    const { tokens } = get()
    const t = tokens[idx]
    if (t && t.kind === 'word') return t.wordIndex
    const n = wordAtOrAfter(idx + 1, tokens.length - 1)
    const nt = n !== null ? tokens[n] : undefined
    return nt && nt.kind === 'word' ? nt.wordIndex : 0
  }

  // RSVP loop, bounded to the current section. Stops (back to the reading view)
  // at the section end or on an atomic block.
  const scheduleNext = () => {
    const { tokens, currentIndex, cfg, rampStart, sections, currentSection } = get()
    const sec = sections[currentSection]
    const token = tokens[currentIndex]

    if (!token || (sec && currentIndex > sec.tokenEnd) || token.kind === 'atomic') {
      clearTimer()
      set({ mode: 'section', revealed: true, paused: false })
      return
    }

    const chunk = chunkAt(tokens, currentIndex, cfg.chunkSize)
    if (!chunk) {
      clearTimer()
      set({ mode: 'section', revealed: true, paused: false })
      return
    }

    const delay = chunkDelay(chunk, cfg, rampStart)
    timer = setTimeout(() => {
      set({ currentIndex: chunk.end + 1 })
      scheduleNext()
    }, delay)
  }

  const gotoSection = (idx: number) => {
    clearTimer()
    const { sections } = get()
    if (sections.length === 0) return
    const clamped = Math.max(0, Math.min(sections.length - 1, idx))
    set({
      currentSection: clamped,
      revealed: false,
      currentIndex: sections[clamped].tokenStart,
      mode: 'section',
      paused: false,
    })
  }

  /** Actually start the RSVP loop from token `index` (no countdown). */
  const startPlaying = (index: number) => {
    clearTimer()
    set({ currentIndex: index, mode: 'playing', paused: false, rampStart: rampOriginAt(index) })
    scheduleNext()
  }

  return {
    tokens: [],
    blocks: [],
    sections: [],
    currentIndex: 0,
    currentSection: 0,
    revealed: false,
    mode: 'idle',
    paused: false,
    cfg: loadConfig(),
    rampStart: 0,
    stepUnits: [],
    stepIndex: 0,
    pendingRsvp: null,
    src: '',
    docKey: '',
    docTitle: '',
    comments: [],
    library: restoreLocalLibrary(),
    activeDocId: null,
    libraryOpen: false,

    load: (src, meta) => {
      clearTimer()
      const { tokens, blocks, sections } = parseMarkdown(src)
      const docKey = docKeyFor(src, meta?.documentId)
      const activeDocId = meta?.documentId ?? null
      set({
        tokens,
        blocks,
        sections,
        currentIndex: sections[0]?.tokenStart ?? 0,
        currentSection: 0,
        revealed: false,
        mode: 'idle',
        paused: false,
        rampStart: 0,
        stepUnits: [],
        stepIndex: 0,
        src,
        docKey,
        docTitle: meta?.title ?? '',
        comments: restoreComments(docKey),
        activeDocId,
        // Opening a doc clears its unread flag and closes the overlay.
        library: activeDocId
          ? get().library.map((d) => (d.documentId === activeDocId ? { ...d, unread: false } : d))
          : get().library,
        libraryOpen: false,
      })
    },

    exit: () => {
      clearTimer()
      set({
        tokens: [],
        blocks: [],
        sections: [],
        currentIndex: 0,
        currentSection: 0,
        revealed: false,
        mode: 'idle',
        paused: false,
        rampStart: 0,
        stepUnits: [],
        stepIndex: 0,
        src: '',
        docKey: '',
        docTitle: '',
        comments: [],
        // Keep `library` intact — leaving to landing should still let the human
        // resume any past read/review from the always-visible library CTA.
        activeDocId: null,
        libraryOpen: false,
      })
    },

    startCountdown: () => {
      clearTimer()
      set({ mode: 'countdown' })
    },

    enterReading: () => {
      clearTimer()
      gotoSection(0)
    },

    enterKey: () => {
      const { mode, revealed, currentSection } = get()
      if (mode !== 'section') return
      if (!revealed) set({ revealed: true })
      else gotoSection(currentSection + 1)
    },

    nextSection: () => gotoSection(get().currentSection + 1),
    prevSection: () => gotoSection(get().currentSection - 1),
    selectSection: (idx) => gotoSection(idx),
    // Like gotoSection but lands in the revealed reading view.
    gotoSectionRevealed: (idx: number) => {
      clearTimer()
      const { sections } = get()
      if (!sections.length) return
      const clamped = Math.max(0, Math.min(sections.length - 1, idx))
      set({
        currentSection: clamped,
        revealed: true,
        currentIndex: sections[clamped].tokenStart,
        mode: 'section',
        paused: false,
      })
    },

    // Clicking a word: prime the Ready/Set/Focus countdown before RSVP.
    rsvpFrom: (index) => {
      clearTimer()
      set({ pendingRsvp: index, mode: 'countdown', paused: false })
    },

    beginRsvp: () => {
      const idx = get().pendingRsvp
      set({ pendingRsvp: null })
      if (idx !== null) startPlaying(idx)
      else set({ mode: 'section', revealed: true })
    },

    toggleRsvp: () => {
      const { mode, paused, revealed, sections, currentSection } = get()
      if (mode === 'playing') {
        if (paused) {
          // Resume in place — same re-ease-in as any other (re)start.
          startPlaying(get().currentIndex)
        } else {
          clearTimer()
          set({ paused: true }) // freeze on the current chunk; stays in 'playing'
        }
        return
      }
      if (mode !== 'section') return
      if (!revealed) {
        set({ revealed: true })
        return
      }
      const sec = sections[currentSection]
      if (!sec) return
      // Resume from where we paused (currentIndex) if it's still inside this
      // section; otherwise start from the section's first word. Resume plays
      // immediately (no countdown — the countdown is for fresh starts).
      const { currentIndex } = get()
      const from =
        currentIndex >= sec.tokenStart && currentIndex <= sec.tokenEnd
          ? wordAtOrAfter(currentIndex, sec.tokenEnd)
          : wordAtOrAfter(sec.tokenStart, sec.tokenEnd)
      if (from !== null) startPlaying(from)
    },

    rsvpNudge: (delta) => {
      const { mode, paused, currentIndex, sections, currentSection } = get()
      if (mode !== 'playing' || !paused) return
      const sec = sections[currentSection]
      if (!sec) return
      const next =
        delta > 0
          ? wordAtOrAfter(currentIndex + 1, sec.tokenEnd)
          : wordAtOrBefore(currentIndex - 1, sec.tokenStart)
      if (next !== null) set({ currentIndex: next })
    },

    rsvpSeek: (index) => {
      const { mode, paused, sections, currentSection } = get()
      if (mode !== 'playing' || !paused) return
      const sec = sections[currentSection]
      if (!sec || index < sec.tokenStart || index > sec.tokenEnd) return
      if (get().tokens[index]?.kind !== 'word') return
      set({ currentIndex: index })
    },

    startStepping: () => {
      clearTimer()
      const { tokens, blocks, sections, currentSection, currentIndex } = get()
      const sec = sections[currentSection]
      if (!sec) return
      const units = buildSteps(tokens, blocks, sec)
      if (units.length === 0) return // nothing to step through
      // Starts at the unit covering currentIndex — the section start by
      // default, or wherever the reader last clicked a word to select it.
      const stepIndex = stepIndexForCursor(units, tokens, currentIndex)
      set({ stepUnits: units, stepIndex, mode: 'stepping', revealed: true })
    },

    stepNext: () => {
      const { stepIndex, stepUnits } = get()
      if (stepIndex < stepUnits.length - 1) set({ stepIndex: stepIndex + 1 }) // clamp at last
    },

    stepPrev: () => {
      const { stepIndex } = get()
      if (stepIndex > 0) set({ stepIndex: stepIndex - 1 })
    },

    focusDeeper: () => {
      const { mode, revealed } = get()
      if (mode === 'section') {
        if (!revealed) set({ revealed: true }) // heading -> reading
        else get().startStepping() // reading -> step
      } else if (mode === 'stepping') {
        get().stepNext() // step -> next unit
      }
    },

    rsvpSection: () => {
      const { sections, currentSection } = get()
      const sec = sections[currentSection]
      if (!sec) return
      const from = wordAtOrAfter(sec.tokenStart, sec.tokenEnd)
      if (from !== null) get().rsvpFrom(from) // countdown then play from start
    },

    rsvpHere: () => {
      const { sections, currentSection, currentIndex } = get()
      const sec = sections[currentSection]
      if (!sec) return
      // From wherever the reader last clicked a word to select it; the
      // section start by default (currentIndex resets there on entry).
      const from =
        currentIndex >= sec.tokenStart && currentIndex <= sec.tokenEnd
          ? wordAtOrAfter(currentIndex, sec.tokenEnd)
          : wordAtOrAfter(sec.tokenStart, sec.tokenEnd)
      if (from !== null) get().rsvpFrom(from)
    },

    selectWord: (index) => {
      const { mode, revealed, tokens, sections, currentSection } = get()
      if (mode !== 'section' || !revealed) return
      const sec = sections[currentSection]
      if (!sec || index < sec.tokenStart || index > sec.tokenEnd) return
      if (tokens[index]?.kind !== 'word') return
      set({ currentIndex: index })
    },

    goBack: () => {
      const { mode, revealed } = get()
      if (mode === 'playing' || mode === 'stepping') {
        clearTimer()
        set({ mode: 'section', revealed: true, paused: false })
      } else if (mode === 'countdown') {
        clearTimer()
        set({ pendingRsvp: null, mode: 'section', revealed: true, paused: false })
      } else if (mode === 'section' && revealed) {
        set({ revealed: false }) // reading -> heading
      }
      // collapsed heading: stay put — landing only via the ✕ button
    },

    setCfg: (partial) => {
      const next = sanitizeConfig({
        ...get().cfg,
        ...alignForThemeSwitch(get().cfg, partial),
      })
      saveConfig(next)
      set({ cfg: next })
    },

    addComment: (c) => {
      const { comments, docKey } = get()
      const id = `c${comments.length + 1}_${Date.now().toString(36)}`
      const next = [...comments, { ...c, id, createdAt: Date.now(), resolved: false }]
      set({ comments: next })
      persistComments(docKey, next)
      return id
    },

    updateComment: (id, body) => {
      const next = get().comments.map((c) => (c.id === id ? { ...c, body } : c))
      set({ comments: next })
      persistComments(get().docKey, next)
    },

    removeComment: (id) => {
      const next = get().comments.filter((c) => c.id !== id)
      set({ comments: next })
      persistComments(get().docKey, next)
    },

    resolveComment: (id, resolved) => {
      const next = get().comments.map((c) => (c.id === id ? { ...c, resolved } : c))
      set({ comments: next })
      persistComments(get().docKey, next)
    },

    clearComments: () => {
      set({ comments: [] })
      persistComments(get().docKey, [])
    },

    receiveDoc: (incoming, foreground) => {
      if (!incoming.markdown || !incoming.documentId) return
      const { library, tokens, activeDocId } = get()
      if (library.some((d) => d.documentId === incoming.documentId)) return // dedupe replay
      const entry: LibraryDoc = {
        documentId: incoming.documentId,
        title: incoming.title?.trim() || 'Untitled',
        markdown: incoming.markdown,
        source: 'bridge',
        createdAt: incoming.createdAt ?? Date.now(),
        unread: true,
      }
      set({ library: capLibrary([...library, entry], foreground ? entry.documentId : activeDocId) })
      if (!foreground) return
      // Nothing loaded yet: ReaderView mounts and enters the heading view itself.
      // Already showing a doc: switch the way the library picker does.
      if (tokens.length === 0) get().load(entry.markdown, { documentId: entry.documentId, title: entry.title })
      else get().switchTo(entry.documentId)
    },

    loadLocal: (src, title) => {
      if (!src.trim()) return
      const documentId = docKeyFor(src) // content-hash — stable across paste/open of the same text
      const displayTitle = title?.trim() || deriveTitle(src)
      const { library } = get()
      let next = library
      if (!library.some((d) => d.documentId === documentId)) {
        const entry: LibraryDoc = {
          documentId,
          title: displayTitle,
          markdown: src,
          source: 'local',
          createdAt: Date.now(),
          unread: false, // the human just opened it themselves
        }
        next = capLibrary([...library, entry], documentId)
        set({ library: next })
        persistLocalLibrary(next)
      }
      // load() drives the reader; ReaderView mounts (landing -> reader) and its
      // effect enters the heading view, same as any first load.
      get().load(src, { documentId, title: displayTitle })
    },

    switchTo: (documentId) => {
      const entry = get().library.find((d) => d.documentId === documentId)
      if (!entry) return
      // load() restores the doc's own comments but leaves mode 'idle'. ReaderView
      // is already mounted (no remount to fire its enterReading effect), so drive
      // the heading view explicitly — same entry point as a first load.
      get().load(entry.markdown, { documentId: entry.documentId, title: entry.title })
      get().enterReading()
    },

    openLibrary: () => set({ libraryOpen: true }),
    closeLibrary: () => set({ libraryOpen: false }),
    toggleLibrary: () => set({ libraryOpen: !get().libraryOpen }),
  }
})
