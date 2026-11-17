---
description: Update ROADMAP.md (move Done, keep last 10), git add -A, commit with imperative message, push, report.
---

You are closing the Dashboard session. Run this protocol:

0. **Branch safety check.** Run `git branch --show-current`. If the result is NOT `main`, STOP immediately and report to the user: current branch + the diff vs main (`git log --oneline main..HEAD` + `git status --short`). Ask explicitly whether to (a) merge/rebase back onto main before closing, (b) push the side branch as-is, or (c) abort `/end`. Do not proceed to step 1 without user confirmation. This guards against an agent (cloud, worktree, ultrareview) having silently switched the checkout away from `main` mid-session — the canonical session rule is that `/end` pushes to `main` on GitHub.

1. Read `ROADMAP.md`. Based on the session's work:
   - Move newly completed items from `## TODO — Active` (or `## In Progress`) to `## Done — Last 10`, dated with **today's actual date** in `YYYY-MM-DD` format (look it up — do not reuse a date from earlier in the file).
   - Keep `## Done — Last 10` capped at 10 — drop the oldest entries past that.
   - Add any new TODO discovered during the session under `## TODO — Active` with brief context.
   - Update `## In Progress` if work is mid-flight, else leave `_(none)_`.
2. If a non-trivial architectural decision was made this session, append an entry to `DECISIONS.md` (date + decision + rationale).
3. `git add -A`.
4. `git commit -m "<verb: what changed>"` — imperative, present tense, one line. Examples: `fix: escape t.pair in 6 innerHTML sites`, `feat: preset export/import JSON`, `docs: log mini-sidebar design decision`. If multiple unrelated things changed, prefer a more general subject over a list.
5. `git push` (current branch to its tracked remote).
6. **Self-contained session summary table.** This single table is the WHOLE end-of-session report — no separate "Commit / Pushed / ROADMAP changes" block above it. Everything the user needs to read lives in the table + its two meta-lines.

   - **Header line** above the table:
     `**Scope** · N changes · cache JS <start>→<end> · CSS <start>→<end> · M files touched`
     - `N` = count of user-visible changes (does NOT include TRACKING rows).
     - `M` = unique files touched in the commit (from `git diff --stat HEAD^ HEAD`).
     - Omit cache segments if the respective file wasn't bumped this session.

   - **The table** has 3 columns — `Surface | Problem | Change`. Rows are grouped by category; each category is preceded by a separator row whose first cell holds a colored Unicode square + bold caps wrapped in em-dashes, columns 2 and 3 empty:
     - `🟩 **— FIXED —**` — bug fixes
     - `🟪 **— ADDED —**` — new features / UI surfaces
     - `🟦 **— CHANGED —**` — behavior tweaks, renames, UX adjustments
     - `🟥 **— REMOVED —**` — code/feature removal
     - `🟧 **— SPEC —**` — spec, doc, memory, or process changes
     - `🟫 **— TRACKING —**` — git/ROADMAP/DECISIONS metadata (always LAST, mandatory)

     Skip semantic categories that have zero rows (FIXED/ADDED/CHANGED/REMOVED/SPEC). TRACKING is always present.

   - **TRACKING rows** are mandatory and use `—` in the Problem column (no "why" needed for metadata):
     - `Commit` · `—` · `\`<short_hash>\` pushed → \`<branch>\` (was \`<prev_hash>\`)`. If push failed or was skipped, write `\`<short_hash>\` not pushed`.
     - `ROADMAP.md` · `—` · `<bullet list of moves joined by · >`, e.g. `Bloc 11 → Done · added Deferred (auto-rename) · capped Done at 10 (dropped X)`. If no ROADMAP changes this session, write `no changes`.
     - `DECISIONS.md` · `—` · `Appended: <one-line entry title>`. Omit this row entirely if nothing was appended this session.

   - **Footer line** below the table:
     `**✓ Validated live by Max** — X changes · Y spec-only (no UI to test)`
     - `X` = UI changes Max confirmed in browser this session.
     - `Y` = changes with no UI surface (spec, doc, memory). TRACKING rows are NOT counted in X or Y. Drop the `· Y spec-only …` segment if `Y = 0`.

   In each user-facing cell, keep the prose tight: `Surface` = WHERE (UI surface or code subsystem, ~3-6 words); `Problem` = WHY (1 short sentence on what was wrong, `—` for TRACKING rows); `Change` = WHAT (1 short sentence on the fix/feature). No file paths or line numbers — those live in the commit + ROADMAP.

7. **Propose the new session title — do NOT run `/rename` and do NOT tell the user to run it.** Output one final line in French in this exact shape:

   `Tu peux remplacer le titre par : DS - DD/MM - <context>`

   `<context>` is a 3-6 word summary of what actually shipped (read the commit subject + ROADMAP delta — the full picture is unambiguous now, vs. running this at the first user message when scope often differs from the eventual ask). `DD/MM` is today's date. The user handles the rename themselves from this line.

If there is nothing to commit, say so and stop — do not create an empty commit.
