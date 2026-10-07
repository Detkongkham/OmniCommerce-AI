---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
---

# Requesting Code Review

Review after each task in subagent-driven development, after a major feature, and before merging.

1. Get `BASE_SHA` (e.g. `git rev-parse HEAD~1` or `origin/main`) and `HEAD_SHA`.
2. Dispatch a code-reviewer subagent using the template `code-reviewer.md`, filling `{WHAT_WAS_IMPLEMENTED}`, `{PLAN_OR_REQUIREMENTS}`, `{BASE_SHA}`, `{HEAD_SHA}`, `{DESCRIPTION}`. Give it only that context, never session history.
3. Fix Critical issues now and Important ones before proceeding; note Minor ones. If the reviewer is wrong, push back with code/test evidence.
