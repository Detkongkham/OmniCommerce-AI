---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work
---

# Finishing a Development Branch

1. **Verify tests** with the project's test command. If anything fails, show it and stop.
2. **Base branch:** `git merge-base HEAD main` (or ask).
3. **Offer exactly these 4 options, no extra explanation:**
   1. Merge back to `<base>` locally
   2. Push and create a Pull Request
   3. Keep the branch as-is
   4. Discard this work
4. **Execute:**
   - Merge: checkout base, pull, merge, re-run tests on the result, then `git branch -d <branch>`.
   - PR: `git push -u origin <branch>`, then `gh pr create` with a Summary and Test Plan body.
   - Keep: report branch name; touch nothing.
   - Discard: list the branch and commits to be lost, require the user to type `discard`, then checkout base and `git branch -D <branch>`.
5. If a worktree is in use: remove it for options 1 and 4 only (`git worktree remove <path>`); keep it for PR/keep.
