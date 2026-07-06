# anti-vibe-mcp

MCP server that pushes agent-generated markdown into the [Anti-Vibe](https://github.com/Hellstellar/anti-vibe) reader — an RSVP reader for reviewing LLM/agent output without fatigue, heading-by-heading.

It runs a tiny loopback bridge that serves the Anti-Vibe web app from its own origin and live-pushes documents to the open tab over Server-Sent Events, so no copy-paste is needed.

## Install

Add to your MCP client (Claude Desktop `claude_desktop_config.json`, or `claude mcp add`):

```json
{
  "mcpServers": {
    "anti-vibe": {
      "command": "npx",
      "args": ["-y", "anti-vibe-mcp"],
      "env": { "ANTIVIBE_MCP_PORT": "7777" }
    }
  }
}
```

Then ask your agent to "send this to Anti-Vibe for review". The first call opens `http://127.0.0.1:7777`; later calls update the same tab.

## Tools

Both take `{ markdown, title? }` and return `{ documentId, sectionCount, wordCount, url }`.

- **`review_markdown`** — sends your Markdown to the reader as-is (code blocks, tables and structure preserved). Use when the human should review the original output verbatim.
- **`rsvpify_markdown`** — sends output optimized for RSVP speed-reading. Before calling, the agent rewrites the content: rephrase into flowing prose, replace each code block with a short prose summary of what it does, and keep tables/other structured blocks verbatim (Anti-Vibe auto-pauses the RSVP stream on them so the reader stops, studies, then resumes).

## Config

- `ANTIVIBE_MCP_PORT` — bridge port and review URL (default `7777`, loopback only).
- `ANTIVIBE_DIST_DIR` — override the served web-app directory (advanced).
