// Sound effects synthesized with the Web Audio API — no audio files, so they
// stay tiny and work offline. Two palettes ("profiles") selected by theme:
//   chiptune — square/triangle blips for the retro CRT look.
//   soft     — sine tones with a slow attack + lowpass warmth: gentle, calm.
// All calls are no-ops until enabled and are wrapped so audio failures never
// break the app.

let ctx: AudioContext | null = null
let enabled = true

/** Which palette the sfx methods play. Driven by the active theme. */
export type SoundProfile = 'chiptune' | 'soft'
let profile: SoundProfile = 'chiptune'

export function setSoundEnabled(on: boolean) {
  enabled = on
}

export function setSoundProfile(p: SoundProfile) {
  profile = p
}

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

interface ToneOpts {
  type?: OscillatorType
  vol?: number
  /** seconds from now to start */
  at?: number
  /** glide target frequency */
  to?: number
  /** glide curve toward `to` (default exponential) */
  glide?: 'exp' | 'lin'
  /** gain ramp-up time in seconds (default 0.006; larger = softer onset) */
  attack?: number
  /** lowpass cutoff (Hz) for warmth; omit for an unfiltered tone */
  filter?: number
}

function tone(freq: number, dur: number, opts: ToneOpts = {}) {
  const c = audio()
  if (!c) return
  const {
    type = 'square',
    vol = 0.05,
    at = 0,
    to,
    glide = 'exp',
    attack = 0.006,
    filter,
  } = opts
  const t = c.currentTime + at
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (to) {
    const target = Math.max(1, to)
    if (glide === 'lin') osc.frequency.linearRampToValueAtTime(target, t + dur)
    else osc.frequency.exponentialRampToValueAtTime(target, t + dur)
  }
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g)
  // Optional lowpass for warmth (rounds off the harsh upper harmonics).
  let tail: AudioNode = g
  if (filter) {
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(filter, t)
    g.connect(lp)
    tail = lp
  }
  tail.connect(c.destination)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

/** Resume the audio context on a user gesture (autoplay policy). */
export function primeAudio() {
  if (enabled) audio()
}

export const sfx = {
  /** Generic UI click / word selected. */
  click() {
    if (!enabled) return
    if (profile === 'soft')
      tone(523, 0.12, { type: 'sine', vol: 0.03, attack: 0.012, filter: 2600, to: 587 })
    else tone(440, 0.05, { type: 'square', vol: 0.045, to: 540 })
  },
  /** Reveal a section's content — rising two-note. */
  reveal() {
    if (!enabled) return
    if (profile === 'soft') {
      tone(392, 0.2, { type: 'sine', vol: 0.028, attack: 0.02, filter: 2400 })
      tone(587, 0.28, { type: 'sine', vol: 0.022, attack: 0.03, filter: 2400, at: 0.06 })
    } else {
      tone(330, 0.07, { vol: 0.045 })
      tone(494, 0.1, { vol: 0.045, at: 0.06 })
    }
  },
  /** Move between sections — a "page turn". */
  section() {
    if (!enabled) return
    if (profile === 'soft') {
      // Soft airy swell + faint high shimmer, like turning a page.
      tone(330, 0.32, { type: 'sine', vol: 0.03, attack: 0.04, filter: 2200, to: 494, glide: 'lin' })
      tone(880, 0.2, { type: 'sine', vol: 0.012, attack: 0.05, filter: 3000, at: 0.07 })
    } else {
      tone(240, 0.14, { type: 'triangle', vol: 0.05, to: 660 }) // sweep up
      tone(990, 0.06, { type: 'square', vol: 0.03, at: 0.1 }) // bright tick
    }
  },
  /** RSVP playback starts. */
  start() {
    if (!enabled) return
    if (profile === 'soft') {
      tone(392, 0.16, { type: 'sine', vol: 0.028, attack: 0.02, filter: 2600 })
      tone(587, 0.24, { type: 'sine', vol: 0.024, attack: 0.025, filter: 2600, at: 0.07 })
    } else {
      tone(392, 0.05, { vol: 0.04 })
      tone(587, 0.07, { vol: 0.04, at: 0.05 })
    }
  },
  /** RSVP paused / stopped. */
  pause() {
    if (!enabled) return
    if (profile === 'soft')
      tone(440, 0.3, { type: 'sine', vol: 0.026, attack: 0.02, filter: 2200, to: 294, glide: 'lin' })
    else tone(392, 0.08, { type: 'triangle', vol: 0.045, to: 262 })
  },
  /** A new list item flashes during RSVP. */
  listItem() {
    if (!enabled) return
    if (profile === 'soft')
      tone(699, 0.12, { type: 'sine', vol: 0.02, attack: 0.012, filter: 2800 })
    else tone(880, 0.04, { type: 'square', vol: 0.035 })
  },
  /** Countdown beep — step 0..1 normal, focus = brighter. */
  tick(focus = false) {
    if (!enabled) return
    if (profile === 'soft')
      tone(focus ? 659 : 494, focus ? 0.22 : 0.15, {
        type: 'sine',
        vol: 0.03,
        attack: 0.014,
        filter: 2600,
      })
    else tone(focus ? 784 : 523, focus ? 0.12 : 0.07, { vol: 0.05 })
  },
  /** Satisfying chime when a document loads. */
  boot() {
    if (!enabled) return
    if (profile === 'soft') {
      // Warm welcome chord (C–E–G–C), slow attack, gently overlapping.
      const seq: [number, number][] = [
        [262, 0.5],
        [330, 0.5],
        [392, 0.6],
        [523, 0.85],
      ]
      let t = 0
      for (const [f, d] of seq) {
        tone(f, d, { type: 'sine', vol: 0.03, attack: 0.05, filter: 2400, at: t })
        t += 0.09
      }
      tone(784, 0.7, { type: 'sine', vol: 0.013, attack: 0.08, filter: 3000, at: t }) // shimmer
    } else {
      const seq: [number, number][] = [
        [330, 0.09],
        [440, 0.09],
        [554, 0.09],
        [740, 0.18],
      ]
      let t = 0
      for (const [f, d] of seq) {
        tone(f, d, { type: 'square', vol: 0.05, at: t })
        t += d * 0.8
      }
      tone(1175, 0.16, { type: 'triangle', vol: 0.035, at: t }) // sparkle
    }
  },
}
