# Flow Review

A code-review mode that walks a change in **runtime execution order** — like
traversing a sequence diagram — instead of file-by-file. You stay focused on one
hunk at a time while always seeing where you are in the call flow.

## Concept

- A review is a set of **stops**. Each stop maps to a **file** and carries all of
  that file's diff hunks.
- Stops are tagged `flow` (the runtime path — entry → handler → service → effect)
  or `foundation` (models / schemas / contracts / types).
- `flow` stops form a **call graph** via `callsTo`. Navigation follows the graph:
  caller → callee, branching when a stop calls several, with multiple entry points.
  With no `callsTo` edges it degrades to a linear order.
- `foundation` stops sit in a pinned lane, reached directly (read them *after*
  seeing how they're used above).

## How a review is produced (hybrid)

The agent sends only the **traversal structure** via the `review_flow` MCP tool —
never diff text. The tool runs `git diff` in the repo and resolves each stop's
file to its real hunks. This keeps the agent payload small and the diff verbatim.

### `review_flow` tool input

```jsonc
{
  "title": "Add rate limiting to the login endpoint",
  "repoPath": "/abs/path/to/repo",   // optional; else ANTIVIBE_REPO_DIR, else cwd
  "diffBase": "HEAD~1..HEAD",         // optional; see table below
  "stops": [
    {
      "id": "route",
      "file": "src/routes/auth.ts",
      "layer": "flow",                 // 'flow' | 'foundation'
      "title": "Login route",
      "oneLineSummary": "Wires rateLimit in front of the login handler.",
      "explanation": "Markdown prose…",
      "callsTo": ["middleware", "audit"],
      "locator": {                     // OPTIONAL hint — sets match-confidence only
        "hunkHeader": "@@ -3,6 +3,7 @@ …"
      }
    }
  ]
}
```

A stop resolves to **all** of its file's hunks regardless of `locator`; the
locator only marks the match-confidence badge (`exact` / `fuzzy`).

### `diffBase` forms

| Target | `diffBase` |
|---|---|
| Uncommitted (default) | *omit* |
| Staged | `--cached` |
| Last commit | `HEAD~1..HEAD` |
| A specific commit | `<sha>~1..<sha>` |
| Branch vs main | `main...HEAD` |

`diffBase` is split on whitespace, so multi-token forms (`HEAD~1 HEAD`, flags)
work. Renamed, deleted, and binary files are handled (binary shows an
informational placeholder). Missing hunks degrade gracefully (a per-stop warning
in the tool result, never a hard failure).

## Reviewing (keys)

- **← / → (or j / k)** — step hunks within the current file; at the file's end,
  follow the call graph (may prompt a branch choice).
- **1–9** — pick a branch when prompted; **Esc** cancels the prompt.
- **Enter** — enter minimal **focus mode** (one hunk, chrome hidden).
- **Esc** — exit focus, or jump a whole stop back along history.
- **Minimap** — click any node to jump; **call flow** lane shows edges + your path,
  **foundation** lane is pinned at the bottom.
- **Open in editor** — per-hunk deep link; pick your editor (VS Code / Cursor /
  Windsurf / Zed / JetBrains / custom `{path}`/`{line}` template).

## Architecture

- `mcp/flow-resolve.ts` — `git diff` runner + unified-diff parser + hunk matching.
- `mcp/server.ts` — the `review_flow` tool (sibling to `review_markdown`).
- `src/lib/flowGraph.ts` — call-graph model (topo order, roots, depth, callers).
- `src/store/flowStore.ts` — traversal state (current stop, hunk index, history,
  branch prompt, focus mode).
- `src/components/FlowReviewView.tsx` / `FlowStop.tsx` / `SequenceMinimap.tsx` /
  `BranchPicker.tsx` — the UI.

Push routing reuses the existing SSE bridge; docs are discriminated by
`kind: 'flow-review'`. Dev demo: open with `?flowdemo` (see `src/lib/flowSample.ts`).
