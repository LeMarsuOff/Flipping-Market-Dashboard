---
description: Show HEAD, ask explicit confirmation, then git revert HEAD --no-edit. Never reset --hard.
---

Safe undo flow. Never use `git reset --hard` — always `git revert`.

1. Run `git log -1 --stat` and show the full output to the user.
2. **If HEAD is a merge commit** (more than one parent — check with `git rev-list --parents -n 1 HEAD`), warn the user that reverting a merge is more complex (requires `-m <parent>`), and ask how they want to proceed before doing anything. Do not auto-revert merges.
3. Otherwise ask: **"Confirm revert of this commit? (yes/no)"** and STOP. Wait for an explicit `yes` before continuing. Any other answer aborts.
4. On `yes`:
   - `git revert HEAD --no-edit`.
   - Check whether the reverted commit was already pushed: `git log @{u}..HEAD --oneline` before the revert (or compare hash to `git rev-parse @{u}`). If the original commit was on the remote, ask: **"The original commit was already pushed. Push the revert? (yes/no)"** — push only on explicit `yes`.
5. Report the new commit hash and whether it was pushed.

Never use `git reset`, `git checkout --`, or any destructive operation in this flow.
