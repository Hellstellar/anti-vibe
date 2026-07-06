/**
 * Editor deep-link registry for the "open in editor" CTA. Editors register an
 * OS-level URL scheme; clicking an anchor with that href hands the file off to
 * the installed app. Paths are absolute (from the machine that ran the review).
 */

export interface EditorDef {
  id: string
  label: string
  /** Build the deep link for an absolute path + optional 1-based line. */
  url: (absPath: string, line?: number) => string
}

/** `vscode://file/<abs>:<line>` style — absPath already starts with `/`. */
const fileScheme = (scheme: string) => (absPath: string, line?: number) =>
  `${scheme}://file${absPath}${line ? `:${line}` : ''}`

/** JetBrains built-in URL handler (IntelliJ/WebStorm/etc.). */
const jetBrains = (product: string) => (absPath: string, line?: number) =>
  `${product}://open?file=${encodeURIComponent(absPath)}${line ? `&line=${line}` : ''}`

export const EDITORS: EditorDef[] = [
  { id: 'vscode', label: 'VS Code', url: fileScheme('vscode') },
  { id: 'cursor', label: 'Cursor', url: fileScheme('cursor') },
  { id: 'windsurf', label: 'Windsurf', url: fileScheme('windsurf') },
  { id: 'zed', label: 'Zed', url: fileScheme('zed') },
  { id: 'idea', label: 'IntelliJ IDEA', url: jetBrains('idea') },
  { id: 'webstorm', label: 'WebStorm', url: jetBrains('webstorm') },
  { id: 'custom', label: 'Custom…', url: () => '' }, // template applied separately
]

const EDITOR_KEY = 'antivibe-editor'
const TEMPLATE_KEY = 'antivibe-editor-template'

/** Persisted editor choice; falls back to VS Code. */
export function loadEditorId(): string {
  try {
    return localStorage.getItem(EDITOR_KEY) || 'vscode'
  } catch {
    return 'vscode'
  }
}

export function saveEditorId(id: string): void {
  try {
    localStorage.setItem(EDITOR_KEY, id)
  } catch {
    /* ignore */
  }
}

/** Custom scheme template using `{path}` and `{line}` placeholders,
 *  e.g. `myide://open?file={path}&line={line}`. */
export function loadCustomTemplate(): string {
  try {
    return localStorage.getItem(TEMPLATE_KEY) || ''
  } catch {
    return ''
  }
}

export function saveCustomTemplate(tpl: string): void {
  try {
    localStorage.setItem(TEMPLATE_KEY, tpl)
  } catch {
    /* ignore */
  }
}

/** Build the deep link for the chosen editor. Returns '' when it can't be built
 *  (no path, or a custom editor with no/invalid template). */
export function buildEditorUrl(
  editorId: string,
  absPath: string | undefined,
  line: number | undefined,
  customTemplate: string,
): string {
  if (!absPath) return ''
  if (editorId === 'custom') {
    if (!customTemplate.includes('{path}')) return ''
    return customTemplate
      .split('{path}')
      .join(encodeURIComponent(absPath))
      .split('{line}')
      .join(line ? String(line) : '')
  }
  const def = EDITORS.find((e) => e.id === editorId)
  return def ? def.url(absPath, line) : ''
}
