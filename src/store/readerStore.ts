import { create } from 'zustand'
import { parseMarkdown } from '../lib/parseMarkdown'
import { chunkAt, chunkDelay } from '../lib/chunk'
import { DEFAULT_CONFIG } from '../lib/timing'
import type { Block, ReaderConfig, ReaderMode, Token } from '../lib/types'

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
  currentIndex: number
  mode: ReaderMode
  cfg: ReaderConfig
  spotlight: { x: number; y: number }
  /** wordIndex where the current play session began — the ramp eases in from
   *  here, so every pause/resume restarts the slow-start. */
  rampStart: number

  load: (src: string) => void
  exit: () => void
  startCountdown: () => void
  /** Begin the playback loop from the current index. */
  run: () => void
  /** Advance past the atomic token currently shown, then resume. */
  resumeFromAtomic: () => void
  pause: () => void
  togglePause: () => void
  step: (delta: number) => void
  resumeAt: (index: number) => void
  setCfg: (partial: Partial<ReaderConfig>) => void
  setSpotlight: (x: number, y: number) => void
}

export const useReader = create<ReaderState>((set, get) => {
  /** Nearest word-token index in direction `dir` (+1/-1), or null if none. */
  const findWord = (from: number, dir: 1 | -1): number | null => {
    const { tokens } = get()
    for (let i = from + dir; i >= 0 && i < tokens.length; i += dir) {
      if (tokens[i].kind === 'word') return i
    }
    return null
  }

  /** wordIndex to ramp from for a play session starting at token `idx`. */
  const rampOriginAt = (idx: number): number => {
    const { tokens } = get()
    const t = tokens[idx]
    if (t && t.kind === 'word') return t.wordIndex
    const n = findWord(idx, 1)
    const nt = n !== null ? tokens[n] : undefined
    return nt && nt.kind === 'word' ? nt.wordIndex : 0
  }

  const scheduleNext = () => {
    const { tokens, currentIndex, cfg, rampStart } = get()
    const token = tokens[currentIndex]

    if (!token) {
      // Reached the end.
      clearTimer()
      set({ mode: 'idle' })
      return
    }

    if (token.kind === 'atomic') {
      clearTimer()
      set({ mode: 'atomic' })
      return
    }

    const chunk = chunkAt(tokens, currentIndex, cfg.chunkSize)
    if (!chunk) {
      clearTimer()
      set({ mode: 'idle' })
      return
    }

    const delay = chunkDelay(chunk, cfg, rampStart)
    timer = setTimeout(() => {
      set({ currentIndex: chunk.end + 1 })
      scheduleNext()
    }, delay)
  }

  return {
    tokens: [],
    blocks: [],
    currentIndex: 0,
    mode: 'idle',
    cfg: loadConfig(),
    spotlight: { x: 0, y: 0 },
    rampStart: 0,

    load: (src) => {
      clearTimer()
      const { tokens, blocks } = parseMarkdown(src)
      set({ tokens, blocks, currentIndex: 0, mode: 'idle', rampStart: 0 })
    },

    exit: () => {
      clearTimer()
      set({ tokens: [], blocks: [], currentIndex: 0, mode: 'idle', rampStart: 0 })
    },

    startCountdown: () => {
      clearTimer()
      set({ mode: 'countdown' })
    },

    run: () => {
      clearTimer()
      // Play from the current token, easing the ramp in from here (so resuming
      // after a pause starts slow again). If it's atomic, scheduleNext will
      // auto-pause on it (e.g. a leading heading).
      set({ mode: 'playing', rampStart: rampOriginAt(get().currentIndex) })
      scheduleNext()
    },

    // Advance past the atomic token we're paused on, then resume playback.
    resumeFromAtomic: () => {
      clearTimer()
      const next = get().currentIndex + 1
      set({ currentIndex: next, mode: 'playing', rampStart: rampOriginAt(next) })
      scheduleNext()
    },

    pause: () => {
      clearTimer()
      set({ mode: 'paused' })
    },

    togglePause: () => {
      const { mode, run, pause, resumeFromAtomic, startCountdown } = get()
      if (mode === 'playing') pause()
      else if (mode === 'atomic') resumeFromAtomic()
      else if (mode === 'paused') run()
      else if (mode === 'idle') {
        // 'idle' also means finished (currentIndex past end) — restart from
        // the top rather than running a countdown that immediately ends.
        const { currentIndex, tokens } = get()
        if (currentIndex >= tokens.length) set({ currentIndex: 0 })
        startCountdown()
      }
    },

    step: (delta) => {
      // Only meaningful while reading; ignore during countdown/idle so an arrow
      // key can't abort the countdown before playback starts.
      const { mode, currentIndex } = get()
      if (mode !== 'playing' && mode !== 'paused' && mode !== 'atomic') return
      const target = findWord(currentIndex, delta < 0 ? -1 : 1)
      if (target === null) return // at a boundary — stay put
      clearTimer()
      set({ currentIndex: target, mode: 'paused' })
    },

    resumeAt: (index) => {
      clearTimer()
      set({ currentIndex: index, mode: 'playing', rampStart: rampOriginAt(index) })
      scheduleNext()
    },

    setCfg: (partial) => {
      const next = sanitizeConfig({ ...get().cfg, ...partial })
      saveConfig(next)
      set({ cfg: next })
    },

    setSpotlight: (x, y) => set({ spotlight: { x, y } }),
  }
})
