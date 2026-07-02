import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { parseMarkdown } from '../src/lib/parseMarkdown'
import { normalizeMarkdown } from './normalize'
import { makeDoc, makeFlowDoc, setDoc } from './doc-store'
import { startBridge, probeBridge, postIngest, BRIDGE_URL, PORT, log } from './bridge'
import { resolveFlowReview, type FlowReviewInput } from './flow-resolve'

const DESCRIPTION = [
  'Send markdown to the Anti-Vibe reader so a human can review it without fatigue,',
  'moving heading-by-heading and optionally speed-reading each section.',
  'Provide your output as well-structured Markdown — use `#`/`##`/`###` headings to',
  'break it into sections (Anti-Vibe navigates by heading), plus normal Markdown for',
  'lists, tables, code blocks and emphasis. Pass the full content in `markdown`.',
  'Opens the Anti-Vibe tab on first use and live-updates it on later calls.',
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
      log(`reusing existing Anti-Vibe bridge on ${BRIDGE_URL}`)
      ownsBridge = false
    } else if (code === 'EADDRINUSE') {
      log(`port ${PORT} is in use by another program. Set ANTIVIBE_MCP_PORT to a free port.`)
    } else {
      throw err
    }
  }
}

async function main(): Promise<void> {
  await ensureBridge()

  const server = new McpServer({ name: 'anti-vibe', version: '0.1.0' })

  server.registerTool(
    'review_markdown',
    {
      title: 'Send markdown to Anti-Vibe for review',
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
              text: `Sent nothing — the Anti-Vibe bridge is unreachable on ${BRIDGE_URL} (${String(err)}). Is it running?`,
            },
          ],
        }
      }

      const noHeadings = !parsed.sections.some((s) => s.hasHeading)
      const hint = noHeadings
        ? ' Note: no headings found — add `##` headings so Anti-Vibe can split it into reviewable sections.'
        : ''
      const text = `Sent to Anti-Vibe (${sectionCount} section${sectionCount === 1 ? '' : 's'}, ${wordCount} words). Review at ${BRIDGE_URL}.${hint}`

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

  const FLOW_DESCRIPTION = [
    'Push a FLOW-ORDERED code review to Anti-Vibe: the human walks the change in',
    'runtime execution order (like a sequence diagram), not file-by-file. Send ONLY',
    'the traversal STRUCTURE — never the diff text. Anti-Vibe resolves each hunk by',
    'running `git diff` in the repo and matching your locators.',
    'Order `flow` stops top→bottom in call order (entry → handler → service → effect);',
    'put models/schemas/contracts/types in `foundation` and list them bottom→up.',
    'Each stop maps to a FILE — the reviewer steps through all of that file\'s hunks one',
    'at a time. `locator` is an OPTIONAL hint (exact `hunkHeader` "@@ -a,b +c,d @@ ..." or',
    '`lineRange`) that just sets the match-confidence badge. Give each stop a one-line summary.',
  ].join(' ')

  const FLOW_STOP_SCHEMA = z.object({
    id: z.string().describe('Unique id for this stop; referenced by other stops\' callsTo.'),
    file: z.string().describe('Path of the changed file (repo-relative). The stop resolves to all of this file\'s hunks.'),
    locator: z
      .object({
        hunkHeader: z.string().optional().describe('The `@@ ... @@` header of the primary hunk (optional hint).'),
        lineRange: z
          .object({ start: z.number(), end: z.number() })
          .optional()
          .describe('New-file line range of the primary hunk (optional hint).'),
      })
      .optional()
      .describe('Optional hint marking the primary hunk / match confidence. All file hunks are shown regardless.'),
    layer: z.enum(['flow', 'foundation']).describe("'flow' = runtime path; 'foundation' = models/schemas/contracts/types."),
    title: z.string().describe('Short role/title, e.g. "Route handler".'),
    explanation: z.string().describe('Markdown prose explaining the change at this stop.'),
    oneLineSummary: z.string().describe('One-line gist of the hunk in view.'),
    callsTo: z.array(z.string()).optional().describe('Ids of stops this stop calls into.'),
  })

  server.registerTool(
    'review_flow',
    {
      title: 'Send a flow-ordered code review to Anti-Vibe',
      description: FLOW_DESCRIPTION,
      inputSchema: {
        stops: z.array(FLOW_STOP_SCHEMA).min(1).describe('Ordered traversal of the review.'),
        title: z.string().optional().describe('Title for the review.'),
        repoPath: z.string().optional().describe('Repo to run git diff in (defaults to ANTIVIBE_REPO_DIR or cwd).'),
        diffBase: z.string().optional().describe('git diff base, e.g. "HEAD~1" or "main...HEAD" (default: working tree).'),
      },
      outputSchema: {
        documentId: z.string(),
        stopCount: z.number(),
        resolvedCount: z.number(),
        url: z.string(),
      },
    },
    async (input) => {
      let resolved
      try {
        resolved = await resolveFlowReview(input as FlowReviewInput)
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Could not resolve the diff: ${String(err)}` }],
        }
      }

      const doc = makeFlowDoc(resolved.stops, input.title?.trim() || 'Flow Review')

      try {
        if (ownsBridge) setDoc(doc)
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

      const resolvedCount = resolved.stops.filter((s) => s.matchStatus !== 'missing').length
      const hint = resolved.warnings.length
        ? ` Warnings: ${resolved.warnings.join('; ')}.`
        : ''
      const text = `Sent flow review to Anti-Vibe (${doc.stops.length} stops, ${resolvedCount} with diffs). Review at ${BRIDGE_URL}.${hint}`

      return {
        content: [{ type: 'text', text }],
        structuredContent: {
          documentId: doc.documentId,
          stopCount: doc.stops.length,
          resolvedCount,
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
