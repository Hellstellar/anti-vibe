import { create } from 'zustand'
import { parseMarkdown } from '../lib/parseMarkdown'
import { chunkAt, chunkDelay } from '../lib/chunk'
import { buildSteps } from '../lib/steps'
import { DEFAULT_CONFIG } from '../lib/timing'
import { isThemeId, DEFAULT_THEME } from '../lib/theme'
import type {
  Block,
  ReaderConfig,
  ReaderMode,
  Section,
  StepUnit,
  Token,
} from '../lib/types'

const CFG_KEY = 'fixate-config'

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
    soundOn: typeof cfg.soundOn === 'boolean' ? cfg.soundOn : DEFAULT_CONFIG.soundOn,
    theme: isThemeId(cfg.theme) ? cfg.theme : DEFAULT_THEME,
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
  /** Step-mode units for the current section + cursor. */
  stepUnits: StepUnit[]
  stepIndex: number
  /** Token index queued to RSVP after the Ready/Set/Fixate countdown. */
  pendingRsvp: number | null

  load: (src: string) => void
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
   *  Ready/Set/Fixate countdown first). */
  rsvpFrom: (index: number) => void
  /** Called when the pre-RSVP countdown finishes — begins playback. */
  beginRsvp: () => void
  /** Space: pause RSVP, or start it for the revealed section. */
  toggleRsvp: () => void
  startStepping: () => void
  stepNext: () => void
  stepPrev: () => void
  /** Enter: fixate one level deeper (heading -> reveal -> step -> next unit). */
  fixateDeeper: () => void
  /** Cmd/Ctrl+Enter: RSVP the current section from its first word, any level. */
  rsvpSection: () => void
  /** Esc: up one level (RSVP/step -> reading -> heading). Never to landing. */
  goBack: () => void
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
        stepUnits: [],
        stepIndex: 0,
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

    // Clicking a word: prime the Ready/Set/Fixate countdown before RSVP.
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

    fixateDeeper: () => {
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
      const next = sanitizeConfig({ ...get().cfg, ...partial })
      saveConfig(next)
      set({ cfg: next })
    },
  }
})
