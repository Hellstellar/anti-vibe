// Central theming logic. A theme is data: an id (drives the [data-theme]
// attribute and thus every CSS variable) plus a sound palette. To add a theme,
// register it here and add a matching [data-theme='<id>'] block in theme.css —
// no component code needs to change.

import { setSoundProfile, type SoundProfile } from './sfx'
import type { ThemeId } from './types'

export interface ThemeMeta {
  id: ThemeId
  /** Label shown in the settings theme picker. */
  label: string
  /** Which synthesized sound palette this theme plays. */
  sound: SoundProfile
}

export const THEMES: ThemeMeta[] = [
  { id: 'crt', label: 'CRT', sound: 'chiptune' },
  { id: 'cream', label: 'Cream', sound: 'soft' },
]

export const DEFAULT_THEME: ThemeId = 'crt'

const BY_ID = new Map(THEMES.map((t) => [t.id, t]))

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && BY_ID.has(v as ThemeId)
}

/**
 * Apply a theme everywhere: sets the root data-theme attribute (which cascades
 * to all CSS variables, overlays and animations) and switches the sound
 * palette. The single entry point for "make the app look + sound like X" —
 * call on startup and whenever the setting changes.
 */
export function applyTheme(id: ThemeId): void {
  const meta = BY_ID.get(id) ?? BY_ID.get(DEFAULT_THEME)!
  document.documentElement.dataset.theme = meta.id
  setSoundProfile(meta.sound)
}

// Mirrors CFG_KEY in readerStore. Read directly so the theme can be applied
// before React mounts, avoiding a flash of the default theme on first paint.
const CFG_KEY = 'fixate-config'

export function getStoredThemeId(): ThemeId {
  try {
    const raw = localStorage.getItem(CFG_KEY)
    if (raw) {
      const t = (JSON.parse(raw) as { theme?: unknown }).theme
      if (isThemeId(t)) return t
    }
  } catch {
    /* ignore corrupt storage */
  }
  return DEFAULT_THEME
}
