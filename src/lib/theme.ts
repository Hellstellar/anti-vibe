// Central theming logic. A theme is data: an id (drives the [data-theme]
// attribute and thus every CSS variable) plus a sound palette. To add a theme,
// register it here and add a matching [data-theme='<id>'] block in theme.css —
// no component code needs to change.

import { setSoundProfile, type SoundProfile } from './sfx'
import { TEXT_ALIGNS } from './types'
import type { ReaderConfig, TextAlign, ThemeId } from './types'
import { CFG_KEY } from './storageKeys'

export interface ThemeMeta {
  id: ThemeId
  /** Label shown in the settings theme picker. */
  label: string
  /** Which synthesized sound palette this theme plays. */
  sound: SoundProfile
  /** Reading-prose alignment this theme adopts when selected. */
  defaultAlign: TextAlign
}

export const THEMES: ThemeMeta[] = [
  { id: 'crt', label: 'CRT', sound: 'chiptune', defaultAlign: 'center' },
  { id: 'cream', label: 'Cream', sound: 'soft', defaultAlign: 'left' },
]

export const DEFAULT_THEME: ThemeId = 'crt'

const BY_ID = new Map(THEMES.map((t) => [t.id, t]))

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && BY_ID.has(v as ThemeId)
}

export function isTextAlign(v: unknown): v is TextAlign {
  return typeof v === 'string' && (TEXT_ALIGNS as readonly string[]).includes(v)
}

/** The alignment a theme adopts when selected (falls back to the default theme). */
export function defaultAlignFor(id: ThemeId): TextAlign {
  return (BY_ID.get(id) ?? BY_ID.get(DEFAULT_THEME)!).defaultAlign
}

/**
 * Theme→alignment policy: when a config change switches to a *different* theme
 * without explicitly naming an alignment, adopt the new theme's default. Lives
 * next to defaultAlignFor so the whole theme↔align relationship is in one place
 * (the load/corrupt-time fallback is sanitizeConfig's defaultAlignFor).
 */
export function alignForThemeSwitch(
  prev: ReaderConfig,
  patch: Partial<ReaderConfig>,
): Partial<ReaderConfig> {
  if (patch.theme && patch.theme !== prev.theme && patch.align === undefined) {
    return { ...patch, align: defaultAlignFor(patch.theme) }
  }
  return patch
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

/**
 * Apply the reading alignment: sets the root data-align attribute, which the
 * --text-align CSS variable keys off (see theme.css). Callers pass an
 * already-sanitized value (mirrors applyTheme, which trusts its ThemeId).
 */
export function applyAlign(align: TextAlign): void {
  document.documentElement.dataset.align = align
}

/**
 * Read the persisted theme + alignment in a SINGLE localStorage parse. Align
 * falls back to the resolved theme's default when unset/corrupt — matching the
 * reader store's load path so first paint can't disagree with it. Returns
 * defaults (no throw) on missing/corrupt storage.
 */
function getStoredDisplay(): { theme: ThemeId; align: TextAlign } {
  let theme: ThemeId = DEFAULT_THEME
  let align: TextAlign | null = null
  try {
    const raw = localStorage.getItem(CFG_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { theme?: unknown; align?: unknown }
      if (isThemeId(parsed.theme)) theme = parsed.theme
      if (isTextAlign(parsed.align)) align = parsed.align
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { theme, align: align ?? defaultAlignFor(theme) }
}

/**
 * Apply the persisted theme + alignment before React mounts, so there's no
 * flash of the defaults on first paint. The single pre-mount entry point.
 */
export function applyStoredDisplay(): void {
  const { theme, align } = getStoredDisplay()
  applyTheme(theme)
  applyAlign(align)
}
