---
description: Mid-session safety push — status, stage, commit (imperative), push. No ROADMAP update.
---

Mid-session safety push. This is NOT `/end` — do not touch `ROADMAP.md` or `DECISIONS.md`.

1. `git status` — show the user what will be staged.
2. Check for unpushed commits: `git log @{u}..HEAD --oneline`.
3. **Three cases:**
   - **Nothing to commit AND no unpushed commits** → tell the user "Tout est déjà à jour, rien à push." and stop.
   - **Nothing to commit BUT unpushed commits exist** → skip staging/commit, jump straight to `git push`, report what got pushed.
   - **Pending changes exist** → continue with steps 4–6 below.
4. Stage the relevant changes. Prefer explicit `git add <file>` over `git add -A`. Skip `.env*`, `.vercel/`, `*.backup*`, and anything matching `.gitignore`. If unsure about a file, ask before staging it.
5. `git commit -m "<verb: what changed>"` — imperative, present tense, one line, scoped to what was staged.
6. `git push`.
7. Report:
   - **Commit:** `<short_hash> <subject>` (or "none — push-only" for the unpushed-commits case)
   - **Pushed:** yes (+ remote ref)
