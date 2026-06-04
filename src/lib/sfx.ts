// Tiny chiptune-style sound effects synthesized with the Web Audio API.
// No audio files — square/triangle blips fit the retro-CRT theme. All calls are
// no-ops until enabled and are wrapped so audio failures never break the app.

let ctx: AudioContext | null = null
let enabled = true

export function setSoundEnabled(on: boolean) {
  enabled = on
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
}

function tone(freq: number, dur: number, opts: ToneOpts = {}) {
  const c = audio()
  if (!c) return
  const { type = 'square', vol = 0.05, at = 0, to } = opts
  const t = c.currentTime + at
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t)
  osc.stop(t + dur + 0.03)
}

/** Resume the audio context on a user gesture (autoplay policy). */
export function primeAudio() {
  if (enabled) audio()
}

export const sfx = {
  /** Generic UI click / word selected. */
  click() {
    if (!enabled) return
    tone(440, 0.05, { type: 'square', vol: 0.045, to: 540 })
  },
  /** Reveal a section's content — rising two-note. */
  reveal() {
    if (!enabled) return
    tone(330, 0.07, { vol: 0.045 })
    tone(494, 0.1, { vol: 0.045, at: 0.06 })
  },
  /** Move between sections — a quick upward sweep + tick (a "page turn"). */
  section() {
    if (!enabled) return
    tone(240, 0.14, { type: 'triangle', vol: 0.05, to: 660 }) // sweep up
    tone(990, 0.06, { type: 'square', vol: 0.03, at: 0.1 }) // bright tick
  },
  /** RSVP playback starts. */
  start() {
    if (!enabled) return
    tone(392, 0.05, { vol: 0.04 })
    tone(587, 0.07, { vol: 0.04, at: 0.05 })
  },
  /** RSVP paused / stopped. */
  pause() {
    if (!enabled) return
    tone(392, 0.08, { type: 'triangle', vol: 0.045, to: 262 })
  },
  /** A new list item flashes during RSVP. */
  listItem() {
    if (!enabled) return
    tone(880, 0.04, { type: 'square', vol: 0.035 })
  },
  /** Countdown beep — step 0..1 normal, focus = brighter. */
  tick(focus = false) {
    if (!enabled) return
    tone(focus ? 784 : 523, focus ? 0.12 : 0.07, { vol: 0.05 })
  },
  /** Satisfying power-on chime when a document loads. */
  boot() {
    if (!enabled) return
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
  },
}
