// Mermaid support helpers. Pure module scope (safe to import from the tested
// node-env libs); only mermaidThemeVariables touches the DOM, and only when
// called (browser render time).

/** True when an mdast code node is a ```mermaid fence. */
export function isMermaid(node: unknown): boolean {
  return (node as { lang?: string | null } | null)?.lang === 'mermaid'
}

/**
 * Build mermaid `theme: 'base'` themeVariables from the active theme's CSS
 * variables, so diagrams follow CRT/Cream (and any future theme) without a
 * per-theme mermaid palette. Read at render time — MermaidDiagram re-renders
 * on theme switch, so the values always match the current [data-theme].
 */
export function mermaidThemeVariables(): Record<string, string | boolean> {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    darkMode: css.getPropertyValue('color-scheme').trim() !== 'light',
    fontFamily: v('--word-font'),

    background: v('--bg'),
    textColor: v('--fg'),
    lineColor: v('--accent-2'),

    // nodes (flowchart/state/class)
    primaryColor: v('--bg-2'),
    primaryTextColor: v('--fg-strong'),
    primaryBorderColor: v('--accent'),
    secondaryColor: v('--bg'),
    secondaryTextColor: v('--fg'),
    secondaryBorderColor: v('--fg-dim'),
    tertiaryColor: v('--bg'),
    tertiaryTextColor: v('--fg'),
    tertiaryBorderColor: v('--fg-dim'),
    nodeTextColor: v('--fg-strong'),
    mainBkg: v('--bg-2'),
    edgeLabelBackground: v('--bg-2'),
    clusterBkg: v('--bg'),
    clusterBorder: v('--fg-dim'),

    // sequence diagrams
    actorBkg: v('--bg-2'),
    actorBorder: v('--accent'),
    actorTextColor: v('--fg-strong'),
    actorLineColor: v('--fg-dim'),
    signalColor: v('--accent-2'),
    signalTextColor: v('--fg'),
    labelBoxBkgColor: v('--bg-2'),
    labelBoxBorderColor: v('--accent'),
    labelTextColor: v('--fg-strong'),
    loopTextColor: v('--fg'),
    noteBkgColor: v('--bg-2'),
    noteTextColor: v('--fg'),
    noteBorderColor: v('--fg-dim'),
    activationBkgColor: v('--bg-2'),
    activationBorderColor: v('--accent-2'),
  }
}
