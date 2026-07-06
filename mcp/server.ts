import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { parseMarkdown } from '../src/lib/parseMarkdown'
import { normalizeMarkdown } from './normalize'
import { makeDoc, addDoc } from './doc-store'
import {
  startBridge,
  probeBridge,
  postIngest,
  postShutdown,
  onBridgeRelinquished,
  openBrowser,
  isOlder,
  VERSION,
  BRIDGE_URL,
  PORT,
  log,
} from './bridge'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const REVIEW_DESCRIPTION = [
  'Send markdown to the Anti-Vibe reader so a human can review it without fatigue,',
  'moving heading-by-heading and optionally speed-reading each section.',
  'Provide your output as well-structured Markdown — use `#`/`##`/`###` headings to',
  'break it into sections (Anti-Vibe navigates by heading), plus normal Markdown for',
  'lists, tables, code blocks and emphasis. Pass the full content in `markdown`.',
  'For CODE REVIEW / diff content: one `###` heading per file, and NEVER paste a whole',
  'file or diff as a single fenced block — each fenced block is one atomic step in the',
  'reader, so an oversized block becomes an unreviewable wall. Split code into small',
  'fenced blocks (one function or one logical hunk, ~15 lines each) and precede each',
  'block with one line of prose saying WHY that piece exists. This applies doubly to',
  'NEW files: present them one function/section at a time, never verbatim top-to-bottom.',
  'Opens the Anti-Vibe tab on first use and live-updates it on later calls.',
].join(' ')

const RSVP_DESCRIPTION = [
  'Send an agent response to the Anti-Vibe reader OPTIMIZED for RSVP speed-reading,',
  'where one word is flashed at a time. Because raw agent output reads badly word-by-word,',
  'YOU must rewrite the content before passing it in `markdown`:',
  '(1) Rephrase into flowing, natural prose — full sentences, minimal symbols, no bullet',
  'fragments or telegraphic notes; write it as if it were read aloud.',
  '(2) Replace every code block with a short PROSE SUMMARY of what the code does',
  '(e.g. "A function that validates the token expiry using a strict less-than check.").',
  'Do not paste raw code into the prose — summarize it.',
  '(3) Keep `#`/`##` headings as the section spine.',
  '(4) When a TABLE or other structured element is essential to keep verbatim, include it',
  'as a normal Markdown table/code block — Anti-Vibe renders these as atomic blocks and',
  'AUTO-PAUSES the RSVP stream on them so the reader stops and studies them, then resumes.',
  'Use this tool for content a human will speed-read; use `review_markdown` to preserve',
  'the original code and structure verbatim.',
].join(' ')

/** True when this process bound the bridge port; false when it forwards to a sibling. */
let ownsBridge = false

// If a newer server takes over the shared port, stop owning it and forward
// future pushes to the new owner — without terminating this MCP session.
onBridgeRelinquished(() => {
  ownsBridge = false
  log(`relinquished bridge on port ${PORT}; forwarding pushes to the new owner`)
})

async function ensureBridge(): Promise<void> {
  try {
    await startBridge()
    ownsBridge = true
    return
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err
  }

  // Port taken. Find out whether it's an Anti-Vibe bridge, and which version.
  const health = await probeBridge()
  if (!health) {
    log(`port ${PORT} is in use by another program. Set ANTIVIBE_MCP_PORT to a free port.`)
    ownsBridge = false
    return
  }

  // Older bridge (or a pre-handshake one, which reports 0.0.0): ask it to step
  // aside, then reclaim the port so pushes hit the up-to-date server + UI.
  if (isOlder(health.version, VERSION)) {
    log(`replacing older Anti-Vibe bridge v${health.version} with v${VERSION}`)
    await postShutdown()
    for (let i = 0; i < 20; i++) {
      try {
        await startBridge()
        ownsBridge = true
        return
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err
        await delay(100) // wait for the old bridge to release the port
      }
    }
    // The old bridge never released it (e.g. a pre-handshake bridge with no
    // /shutdown route). Fall back to forwarding rather than failing to start.
    log(`could not reclaim port ${PORT}; forwarding to the existing bridge`)
    ownsBridge = false
    return
  }

  // Same or newer bridge already owns the port — reuse it (forward pushes).
  log(`reusing existing Anti-Vibe bridge v${health.version} on ${BRIDGE_URL}`)
  ownsBridge = false
}

type ToolResult = {
  isError?: boolean
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: { documentId: string; sectionCount: number; wordCount: number; url: string }
}

/**
 * Shared ingest path for both tools: normalize -> parse -> push to the bridge.
 * `verb` only varies the human-facing success line; behaviour is identical.
 */
async function ingest(markdown: string, title: string | undefined, verb: string): Promise<ToolResult> {
  const normalized = normalizeMarkdown(markdown, title)

  let parsed
  try {
    parsed = parseMarkdown(normalized)
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `Could not parse the markdown: ${String(err)}` }] }
  }

  const sectionCount = parsed.sections.length
  const wordCount = parsed.tokens.reduce((n, t) => (t.kind === 'word' ? n + 1 : n), 0)
  const displayTitle = title?.trim() || parsed.sections.find((s) => s.hasHeading)?.title || 'Untitled'
  const doc = makeDoc(normalized, displayTitle)

  try {
    if (ownsBridge) addDoc(doc)
    else await postIngest(doc)
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Sent nothing — the Anti-Vibe bridge is unreachable on ${BRIDGE_URL} (${String(err)}). Is it running?`,
        },
      ],
    }
  }

  const noHeadings = !parsed.sections.some((s) => s.hasHeading)
  const hint = noHeadings
    ? ' Note: no headings found — add `##` headings so Anti-Vibe can split it into reviewable sections.'
    : ''
  const text = `${verb} (${sectionCount} section${sectionCount === 1 ? '' : 's'}, ${wordCount} words). Review at ${BRIDGE_URL}.${hint}`

  return {
    content: [{ type: 'text', text }],
    structuredContent: { documentId: doc.documentId, sectionCount, wordCount, url: BRIDGE_URL },
  }
}

const INPUT_SCHEMA = {
  markdown: z.string().min(1).describe('The full document as Markdown, ideally with #/## headings.'),
  title: z.string().optional().describe('Optional title; used as an H1 if the markdown has none.'),
}
const OUTPUT_SCHEMA = {
  documentId: z.string(),
  sectionCount: z.number(),
  wordCount: z.number(),
  url: z.string(),
}

/**
 * `anti-vibe-mcp open`: launch the reader to browse past reviews without an
 * agent pushing. Ensures a bridge is up (binding + restoring the persisted
 * library from disk, or reusing an existing one), then opens the browser. If we
 * had to bind it ourselves, stay alive so the reader keeps being served; if a
 * bridge was already running, its owner keeps serving and we can exit.
 */
async function openReader(): Promise<void> {
  await ensureBridge()
  openBrowser(BRIDGE_URL)
  if (!ownsBridge) {
    log(`opened ${BRIDGE_URL} (an existing Anti-Vibe bridge is serving it)`)
    process.exit(0)
  }
  log(`Anti-Vibe reader open at ${BRIDGE_URL} — leave this running to keep it available.`)
  // No stdio connect: the listening HTTP server keeps the process alive.
}

async function main(): Promise<void> {
  if (process.argv[2] === 'open') {
    await openReader()
    return
  }

  await ensureBridge()

  const server = new McpServer({ name: 'anti-vibe', version: '0.1.0' })

  server.registerTool(
    'review_markdown',
    {
      title: 'Send markdown to Anti-Vibe for review',
      description: REVIEW_DESCRIPTION,
      inputSchema: INPUT_SCHEMA,
      outputSchema: OUTPUT_SCHEMA,
    },
    ({ markdown, title }) => ingest(markdown, title, 'Sent to Anti-Vibe'),
  )

  server.registerTool(
    'rsvpify_markdown',
    {
      title: 'Rewrite agent output as RSVP prose and send to Anti-Vibe',
      description: RSVP_DESCRIPTION,
      inputSchema: {
        markdown: z
          .string()
          .min(1)
          .describe('Your rewritten prose: natural sentences, code replaced by summaries, tables kept verbatim.'),
        title: z.string().optional().describe('Optional title; used as an H1 if the prose has none.'),
      },
      outputSchema: OUTPUT_SCHEMA,
    },
    ({ markdown, title }) => ingest(markdown, title, 'Sent RSVP prose to Anti-Vibe'),
  )

  await server.connect(new StdioServerTransport())
  log('MCP server ready (stdio)')
}

main().catch((err) => {
  log('fatal:', err)
  process.exit(1)
})
