---
description: Pull latest, re-read CLAUDE.md + ROADMAP.md, report branch + clean state + top 3 Active TODOs.
---

You are starting a Dashboard session. Run this protocol:

1. `git pull` and report the result (already up to date, fast-forward, or conflict).
2. Read `CLAUDE.md` and `ROADMAP.md` from the project root.
3. Report in this exact shape, nothing else:
   - **Branch:** current branch name
   - **Clean?:** working tree status (clean / N modified / N untracked)
   - **Last commit:** `<short_hash> <subject>`
   - **Top 3 Active TODOs:** the first three bullets under `## TODO — Active` in ROADMAP.md, one line each (truncate to ~120 chars).

Do not start any code work. Do not modify any file. This is a status report only.
