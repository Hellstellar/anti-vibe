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
        // instead of DEFAULT_CONFIG.align masking it with 'center'.
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

/** Cap on retained received docs client-side (mirrors the bridge's MAX_DOCS). */
const MAX_LIBRARY = 20

/** Trim to MAX_LIBRARY, evicting oldest first but never the active doc. `lib`
 *  is oldest-first, so this drops from the front. */
function capLibrary(lib: LibraryDoc[], activeId: string | null): LibraryDoc[] {
  if (lib.length <= MAX_LIBRARY) return lib
  let excess = lib.length - MAX_LIBRARY
  return lib.filter((d) => {
    if (excess > 0 && d.documentId !== activeId) {
      excess--
      return false
    }
    return true
  })
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
  exit: () => void
  startCountdown: () => void
  /** Enter the section reading view (called when the countdown finishes). */
  enterReading: () => void
  /** Enter key: reveal the current section, or advance to the next one. */
  enterKey: () => void
  nextSection: () => void
  prevSection: () => void
  /** Go to a section and reveal it (used by hold-to-advance). */
  gotoSectionRevealed: (idx: number) => void
  /** Start RSVP for the current section from token `index` (runs the
   *  Ready/Set/Focus countdown first). */
  rsvpFrom: (index: number) => void
  /** Called when the pre-RSVP countdown finishes — begins playback. */
  beginRsvp: () => void
  /** Space: pause RSVP, or start it for the revealed section. */
  toggleRsvp: () => void
  startStepping: () => void
  stepNext: () => void
  stepPrev: () => void
  /** Enter: focus one level deeper (heading -> reveal -> step -> next unit). */
  focusDeeper: () => void
  /** Cmd/Ctrl+Enter: RSVP the current section from its first word, any level. */
  rsvpSection: () => void
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

  /** Add a bridge-pushed doc to the library. The first doc (nothing loaded yet)
   *  opens immediately; a push arriving mid-review is appended silently (unread
   *  badge) so the human is never yanked off what they're reading. Deduped by
   *  documentId, so SSE replay on (re)connect is idempotent. */
  receiveDoc: (doc: { documentId: string; markdown: string; title?: string; createdAt?: number }) => void
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
      set({ mode: 'section', revealed: true })
      return
    }

    const chunk = chunkAt(tokens, currentIndex, cfg.chunkSize)
    if (!chunk) {
      clearTimer()
      set({ mode: 'section', revealed: true })
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
    })
  }

  /** Actually start the RSVP loop from token `index` (no countdown). */
  const startPlaying = (index: number) => {
    clearTimer()
    set({ currentIndex: index, mode: 'playing', rampStart: rampOriginAt(index) })
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
    cfg: loadConfig(),
    rampStart: 0,
    stepUnits: [],
    stepIndex: 0,
    pendingRsvp: null,
    src: '',
    docKey: '',
    docTitle: '',
    comments: [],
    library: [],
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
        rampStart: 0,
        stepUnits: [],
        stepIndex: 0,
        src: '',
        docKey: '',
        docTitle: '',
        comments: [],
        // Leaving to landing drops the session library; a tab reload re-hydrates
        // it from the bridge's /__antivibe/docs catch-up.
        library: [],
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
      })
    },

    // Clicking a word: prime the Ready/Set/Focus countdown before RSVP.
    rsvpFrom: (index) => {
      clearTimer()
      set({ pendingRsvp: index, mode: 'countdown' })
    },

    beginRsvp: () => {
      const idx = get().pendingRsvp
      set({ pendingRsvp: null })
      if (idx !== null) startPlaying(idx)
      else set({ mode: 'section', revealed: true })
    },

    toggleRsvp: () => {
      const { mode, revealed, sections, currentSection } = get()
      if (mode === 'playing') {
        clearTimer()
        set({ mode: 'section', revealed: true })
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

    startStepping: () => {
      clearTimer()
      const { tokens, blocks, sections, currentSection } = get()
      const sec = sections[currentSection]
      if (!sec) return
      const units = buildSteps(tokens, blocks, sec)
      if (units.length === 0) return // nothing to step through
      set({ stepUnits: units, stepIndex: 0, mode: 'stepping', revealed: true })
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

    goBack: () => {
      const { mode, revealed } = get()
      if (mode === 'playing' || mode === 'stepping') {
        clearTimer()
        set({ mode: 'section', revealed: true })
      } else if (mode === 'countdown') {
        clearTimer()
        set({ pendingRsvp: null, mode: 'section', revealed: true })
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

    receiveDoc: (incoming) => {
      if (!incoming.markdown || !incoming.documentId) return
      const { library, tokens, activeDocId } = get()
      if (library.some((d) => d.documentId === incoming.documentId)) return // dedupe replay
      const entry: LibraryDoc = {
        documentId: incoming.documentId,
        title: incoming.title?.trim() || 'Untitled',
        markdown: incoming.markdown,
        createdAt: incoming.createdAt ?? Date.now(),
        unread: true,
      }
      const isFirst = tokens.length === 0
      set({ library: capLibrary([...library, entry], isFirst ? entry.documentId : activeDocId) })
      // First doc (fresh tab / landing with nothing open) shows immediately.
      if (isFirst) get().load(entry.markdown, { documentId: entry.documentId, title: entry.title })
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

    openLibrary: () => {
      if (get().library.length > 0) set({ libraryOpen: true })
    },
    closeLibrary: () => set({ libraryOpen: false }),
    toggleLibrary: () => (get().libraryOpen ? set({ libraryOpen: false }) : get().openLibrary()),
  }
})
