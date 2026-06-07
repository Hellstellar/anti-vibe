/**
 * Light, NON-destructive cleanup of agent-supplied markdown. We deliberately do
 * not infer headings or restructure content — the agent owns content semantics
 * (the tool description instructs it to use #/## headings); Fixate owns
 * presentation. We only: normalize line endings, trim outer blank space, and —
 * if a title was given and the doc has no leading H1 — prepend `# {title}` so
 * the document gets at least one named section.
 */
export function normalizeMarkdown(markdown: string, title?: string): string {
  let md = markdown.replace(/\r\n?/g, '\n')
  md = md.replace(/^\n+/, '').replace(/\s+$/, '')
  const t = title?.trim()
  if (t && !/^#\s/.test(md)) {
    md = `# ${t}\n\n${md}`
  }
  return md
}
