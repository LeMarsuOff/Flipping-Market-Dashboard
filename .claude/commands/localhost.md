---
description: Start (or report) a local preview server for the dashboard and return the URL.
---

Get the dashboard running locally and return the localhost URL.

1. Call `mcp__Claude_Preview__preview_list` first. If a preview is already running for this project root, report its URL and stop.
2. Otherwise, call `mcp__Claude_Preview__preview_start` with the project root (`$CLAUDE_PROJECT_DIR` or the current working directory).
3. Report a single line: `Preview: <url>`.

Do not open the page, do not click, do not modify any file. Just return the URL.
