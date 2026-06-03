import { create } from 'zustand'
import { parseMarkdown } from '../lib/parseMarkdown'
import { chunkAt, chunkDelay } from '../lib/chunk'
import { DEFAULT_CONFIG } from '../lib/timing'
import type { Block, ReaderConfig, ReaderMode, Section, Token } from '../lib/types'

const CFG_KEY = 'rsvp-reader-config'

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
  return {
    ...cfg,
    startWpm,
    targetWpm,
    rampWords: Math.max(0, Math.round(num(cfg.rampWords, DEFAULT_CONFIG.rampWords))),
    chunkSize: Math.max(1, Math.round(num(cfg.chunkSize, DEFAULT_CONFIG.chunkSize))),
    spotlightRadius: Math.min(
      400,
      Math.max(30, Math.round(num(cfg.spotlightRadius, DEFAULT_CONFIG.spotlightRadius))),
    ),
    previewWords: Math.min(
      400,
      Math.max(5, Math.round(num(cfg.previewWords, DEFAULT_CONFIG.previewWords))),
    ),
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

  load: (src: string) => void
  exit: () => void
  startCountdown: () => void
  /** Enter the section reading view (called when the countdown finishes). */
  enterReading: () => void
  /** Enter key: reveal the current section, or advance to the next one. */
  enterKey: () => void
  nextSection: () => void
  prevSection: () => void
  /** Start RSVP for the current section from token `index`. */
  rsvpFrom: (index: number) => void
  /** Space: pause RSVP, or start it for the revealed section. */
  toggleRsvp: () => void
  setCfg: (partial: Partial<ReaderConfig>) => void
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

    load: (src) => {
      clearTimer()
      const { tokens, blocks, sections } = parseMarkdown(src)
      set({
        tokens,
        blocks,
        sections,
        currentIndex: sections[0]?.tokenStart ?? 0,
        currentSection: 0,
        revealed: false,
        mode: 'idle',
        rampStart: 0,
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

    rsvpFrom: (index) => {
      clearTimer()
      set({ currentIndex: index, mode: 'playing', rampStart: rampOriginAt(index) })
      scheduleNext()
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
      const start = sec ? wordAtOrAfter(sec.tokenStart, sec.tokenEnd) : null
      if (start !== null) get().rsvpFrom(start)
    },

    setCfg: (partial) => {
      const next = sanitizeConfig({ ...get().cfg, ...partial })
      saveConfig(next)
      set({ cfg: next })
    },
  }
})
