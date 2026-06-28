# anti-vibe-mcp

MCP server that pushes agent-generated markdown into the [Anti-Vibe](https://github.com/) reader — an RSVP reader for reviewing LLM/agent output without fatigue, heading-by-heading.

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

## Tool

- **`review_markdown`** — `{ markdown, title? }`. Normalizes the markdown, validates it parses, sends it to the reader. Returns `{ documentId, sectionCount, wordCount, url }`.

## Config

- `ANTIVIBE_MCP_PORT` — bridge port and review URL (default `7777`, loopback only).
- `ANTIVIBE_DIST_DIR` — override the served web-app directory (advanced).
