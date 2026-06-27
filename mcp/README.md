# fixate-mcp

MCP server that pushes agent-generated markdown into the [Fixate](https://github.com/) reader — an RSVP reader for reviewing LLM/agent output without fatigue, heading-by-heading.

It runs a tiny loopback bridge that serves the Fixate web app from its own origin and live-pushes documents to the open tab over Server-Sent Events, so no copy-paste is needed.

## Install

Add to your MCP client (Claude Desktop `claude_desktop_config.json`, or `claude mcp add`):

```json
{
  "mcpServers": {
    "fixate": {
      "command": "npx",
      "args": ["-y", "fixate-mcp"],
      "env": { "FIXATE_MCP_PORT": "7777" }
    }
  }
}
```

Then ask your agent to "send this to Fixate for review". The first call opens `http://127.0.0.1:7777`; later calls update the same tab.

## Tool

- **`review_markdown`** — `{ markdown, title? }`. Normalizes the markdown, validates it parses, sends it to the reader. Returns `{ documentId, sectionCount, wordCount, url }`.

## Config

- `FIXATE_MCP_PORT` — bridge port and review URL (default `7777`, loopback only).
- `FIXATE_DIST_DIR` — override the served web-app directory (advanced).
