---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs
---

# Verification Before Completion

**No completion claims without fresh verification evidence.** Violating the letter is violating the spirit.

Before any success claim, commit, or PR: identify the command that proves it, run it fully in this message, read the output and exit code, then state the result with the evidence. If it fails, report the actual status.

| Claim | Needs | Not enough |
|---|---|---|
| Tests pass | Test run, 0 failures | Earlier run, "should pass" |
| Build ok | Build exit 0 | Linter passing |
| Bug fixed | Original symptom reproduced, now passes | Code changed |
| Regression test | Red-green: fails with fix reverted | Passes once |
| Agent finished | VCS diff checked | Agent says "success" |
| Requirements met | Line-by-line check vs plan | Tests pass |

Red flags: "should/probably/seems", "Great!/Done!" before verifying, trusting agent reports, partial checks, "just this once".
