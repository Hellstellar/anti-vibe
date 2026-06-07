import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { parseMarkdown } from '../src/lib/parseMarkdown'
import { normalizeMarkdown } from './normalize'
import { makeDoc, setDoc } from './doc-store'
import { startBridge, probeBridge, postIngest, BRIDGE_URL, PORT, log } from './bridge'

const DESCRIPTION = [
  'Send markdown to the Fixate reader so a human can review it without fatigue,',
  'moving heading-by-heading and optionally speed-reading each section.',
  'Provide your output as well-structured Markdown — use `#`/`##`/`###` headings to',
  'break it into sections (Fixate navigates by heading), plus normal Markdown for',
  'lists, tables, code blocks and emphasis. Pass the full content in `markdown`.',
  'Opens the Fixate tab on first use and live-updates it on later calls.',
].join(' ')

/** True when this process bound the bridge port; false when it forwards to a sibling. */
let ownsBridge = false

async function ensureBridge(): Promise<void> {
  try {
    await startBridge()
    ownsBridge = true
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EADDRINUSE' && (await probeBridge())) {
      log(`reusing existing Fixate bridge on ${BRIDGE_URL}`)
      ownsBridge = false
    } else if (code === 'EADDRINUSE') {
      log(`port ${PORT} is in use by another program. Set FIXATE_MCP_PORT to a free port.`)
    } else {
      throw err
    }
  }
}

async function main(): Promise<void> {
  await ensureBridge()

  const server = new McpServer({ name: 'fixate', version: '0.1.0' })

  server.registerTool(
    'review_markdown',
    {
      title: 'Send markdown to Fixate for review',
      description: DESCRIPTION,
      inputSchema: {
        markdown: z.string().min(1).describe('The full document as Markdown, ideally with #/## headings.'),
        title: z.string().optional().describe('Optional title; used as an H1 if the markdown has none.'),
      },
      outputSchema: {
        documentId: z.string(),
        sectionCount: z.number(),
        wordCount: z.number(),
        url: z.string(),
      },
    },
    async ({ markdown, title }) => {
      const normalized = normalizeMarkdown(markdown, title)

      let parsed
      try {
        parsed = parseMarkdown(normalized)
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Could not parse the markdown: ${String(err)}` }],
        }
      }

      const sectionCount = parsed.sections.length
      const wordCount = parsed.tokens.reduce((n, t) => (t.kind === 'word' ? n + 1 : n), 0)
      const displayTitle =
        title?.trim() || parsed.sections.find((s) => s.hasHeading)?.title || 'Untitled'
      const doc = makeDoc(normalized, displayTitle)

      try {
        if (ownsBridge) setDoc(doc)
        else await postIngest(doc)
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Sent nothing — the Fixate bridge is unreachable on ${BRIDGE_URL} (${String(err)}). Is it running?`,
            },
          ],
        }
      }

      const noHeadings = !parsed.sections.some((s) => s.hasHeading)
      const hint = noHeadings
        ? ' Note: no headings found — add `##` headings so Fixate can split it into reviewable sections.'
        : ''
      const text = `Sent to Fixate (${sectionCount} section${sectionCount === 1 ? '' : 's'}, ${wordCount} words). Review at ${BRIDGE_URL}.${hint}`

      return {
        content: [{ type: 'text', text }],
        structuredContent: {
          documentId: doc.documentId,
          sectionCount,
          wordCount,
          url: BRIDGE_URL,
        },
      }
    },
  )

  await server.connect(new StdioServerTransport())
  log('MCP server ready (stdio)')
}

main().catch((err) => {
  log('fatal:', err)
  process.exit(1)
})
