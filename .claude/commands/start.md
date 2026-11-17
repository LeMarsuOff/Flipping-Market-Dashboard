---
description: Pull latest, re-read CLAUDE.md + ROADMAP.md, report branch + clean state + top 3 Active TODOs.
---

You are starting a Dashboard session. Run this protocol:

0. **Get onto `main`.** Run `git fetch origin` then `git branch --show-current`. If it is not `main` (cloud sessions start on an auto-created `claude/...` branch):
   - If the working tree is clean AND `git log --oneline origin/main..HEAD` is empty (the branch holds no work of its own): run `git checkout main 2>/dev/null || git checkout -b main --track origin/main`, then continue. Say in one line that you switched from `<branch>` to `main`.
   - Otherwise (uncommitted changes, or commits not on `main`): STOP, show `git status --short` + `git log --oneline origin/main..HEAD`, and ask the user what to do. Never discard work to switch.
1. `git pull` and report the result (already up to date, fast-forward, or conflict).
2. Read `CLAUDE.md` and `ROADMAP.md` from the project root.
3. Report in this exact shape, nothing else:
   - **Branch:** current branch name
   - **Clean?:** working tree status (clean / N modified / N untracked)
   - **Last commit:** `<short_hash> <subject>`
   - **Top 3 Active TODOs:** the first three bullets under `## TODO — Active` in ROADMAP.md, one line each (truncate to ~120 chars).

Do not start any code work. Do not modify any file. This is a status report only.
