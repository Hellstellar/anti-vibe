import { create } from 'zustand'
import { parseMarkdown } from '../lib/parseMarkdown'
import { chunkAt, chunkDelay } from '../lib/chunk'
import { DEFAULT_CONFIG } from '../lib/timing'
import type { Block, ReaderConfig, ReaderMode, Token } from '../lib/types'

const CFG_KEY = 'rsvp-reader-config'

function loadConfig(): ReaderConfig {
  try {
    const raw = localStorage.getItem(CFG_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        multipliers: { ...DEFAULT_CONFIG.multipliers, ...parsed.multipliers },
      }
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
  /** Index of the previous word token, for stepping backward. */
  const prevWordIndex = (from: number): number => {
    const { tokens } = get()
    for (let i = from - 1; i >= 0; i--) {
      if (tokens[i].kind === 'word') return i
    }
    return from
  }
  const nextWordIndex = (from: number): number => {
    const { tokens } = get()
    for (let i = from + 1; i < tokens.length; i++) {
      if (tokens[i].kind === 'word') return i
    }
    return from
  }

  const scheduleNext = () => {
    const { tokens, currentIndex, cfg } = get()
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

    const delay = chunkDelay(chunk, cfg)
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

    load: (src) => {
      clearTimer()
      const { tokens, blocks } = parseMarkdown(src)
      set({ tokens, blocks, currentIndex: 0, mode: 'idle' })
    },

    exit: () => {
      clearTimer()
      set({ tokens: [], blocks: [], currentIndex: 0, mode: 'idle' })
    },

    startCountdown: () => {
      clearTimer()
      set({ mode: 'countdown' })
    },

    run: () => {
      clearTimer()
      // Play from the current token. If it's atomic, scheduleNext will
      // auto-pause on it (e.g. a leading heading).
      set({ mode: 'playing' })
      scheduleNext()
    },

    // Advance past the atomic token we're paused on, then resume playback.
    resumeFromAtomic: () => {
      clearTimer()
      set({ currentIndex: get().currentIndex + 1, mode: 'playing' })
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
      else if (mode === 'idle') startCountdown()
    },

    step: (delta) => {
      clearTimer()
      const { currentIndex } = get()
      const target =
        delta < 0 ? prevWordIndex(currentIndex) : nextWordIndex(currentIndex)
      set({ currentIndex: target, mode: 'paused' })
    },

    resumeAt: (index) => {
      clearTimer()
      set({ currentIndex: index, mode: 'playing' })
      scheduleNext()
    },

    setCfg: (partial) => {
      const next = { ...get().cfg, ...partial }
      saveConfig(next)
      set({ cfg: next })
    },

    setSpotlight: (x, y) => set({ spotlight: { x, y } }),
  }
})
