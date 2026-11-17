---
description: Short status — git, unpushed commits, top 3 Active TODOs, preview URL if running. Under 10 lines.
---

Report a compact status, total output under 10 lines. No prose, no headers beyond what's listed.

1. `git status --short` — show output verbatim (or `clean` if empty).
2. Unpushed commits: `git log @{u}..HEAD --oneline` (or `none` if empty / no upstream).
3. Top 3 Active TODOs from `ROADMAP.md` under `## TODO — Active`, one line each, truncated to ~100 chars.
4. Preview URL: call `mcp__Claude_Preview__preview_list`; if a server is running for this project, print its URL, else print `Preview: not running`.

Format as a single tight block. No introductions, no closing remarks.
