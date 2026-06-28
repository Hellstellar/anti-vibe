// Single source of truth for localStorage keys (RS-20.4). Imported by both the
// reader store (read/write) and lib/theme (pre-paint read), so the key can
// never desync across the two.

/** Persisted ReaderConfig blob. */
export const CFG_KEY = 'antivibe-config'
