---
description: Send content to the Anti-Vibe reader for fatigue-free review
argument-hint: [what to send — defaults to your last response]
---

Send content to Anti-Vibe for review using the `review_markdown` tool (the `anti-vibe` MCP server).

Content to send: $ARGUMENTS

If the line above is empty, send your most recent substantive output — the last plan, summary, analysis, review, or document you produced in this conversation. Do NOT send this instruction itself.

Format the content as well-structured Markdown before sending:

- Use `##`/`###` headings to split it into reviewable sections — Anti-Vibe navigates by heading, so headings matter.
- Keep lists, tables, code blocks, and emphasis as normal Markdown.
- For code review / diff content: one `###` heading per file. Never paste a whole file or diff as a single fenced block — each fenced block is one atomic step in the reader. Split code into small fenced blocks (one function or one logical hunk, ~15 lines each), each preceded by a one-line "why". New files especially: one function/section per block, never verbatim top-to-bottom.
- Pass a `title` argument when there's a natural document title.

After the tool returns, confirm in ONE line: section count, word count, and the review URL. Do not paste the full content back into the chat — it's in Anti-Vibe now.
