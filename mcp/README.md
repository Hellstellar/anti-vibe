# anti-vibe-mcp

MCP server that pushes agent output into the [Anti-Vibe](https://github.com/Hellstellar/anti-vibe) reader — for people who actually read the diff instead of vibe-merging it. Read LLM/agent output one sentence at a time, skim it heading by heading, or speed-read it via RSVP.

It runs a tiny loopback bridge that serves the Anti-Vibe web app from its own origin and live-pushes documents to the open tab over Server-Sent Events, so no copy-paste is needed.

## Install

Claude Code:

```bash
claude mcp add anti-vibe -- npx -y anti-vibe-mcp
```

Any other MCP client (Claude Desktop `claude_desktop_config.json`, Cursor `mcp.json`):

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

Then ask your agent to "send this to Anti-Vibe for review". The first call opens `http://127.0.0.1:7777`; later calls go to the same tab. If you're in another window, the tab switches to the new document; if you're reading in it, the new document waits in the Documents list (`l`).

## Tools

- **`review_markdown`** — `{ markdown, title? }` → `{ documentId, sectionCount, wordCount, url }`. Sends your Markdown to the reader as-is (code blocks, tables and structure preserved). Use when the human should review the original output verbatim.
- **`rsvpify_markdown`** — `{ markdown, title? }` → `{ documentId, sectionCount, wordCount, url }`. Sends output optimized for RSVP speed-reading. Before calling, the agent rewrites the content: rephrase into flowing prose, replace each code block with a short prose summary of what it does, and keep tables/other structured blocks verbatim (Anti-Vibe auto-pauses the RSVP stream on them so the reader stops, studies, then resumes).
- **`review_flow`** (in development) — `{ stops, title?, repoPath?, diffBase? }` → `{ documentId, stopCount, resolvedCount, url }`. Pushes a **flow-ordered code review**: the human walks a change in runtime execution order (like a sequence diagram), not file-by-file. The agent sends only the traversal *structure* — stops tagged `flow` / `foundation`, wired by `callsTo`, with optional per-hunk reading order (`hunkFlow`) — never the diff text. The server runs `git diff` in the repo and resolves each stop to its real hunks. Use `diffBase` to target staged (`--cached`), a commit (`HEAD~1..HEAD`), or a branch (`main...HEAD`).

## Config

- `ANTIVIBE_MCP_PORT` — bridge port and review URL (default `7777`, loopback only).
- `ANTIVIBE_DIST_DIR` — override the served web-app directory (advanced).
