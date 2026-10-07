---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session
---

# Subagent-Driven Development

Fresh subagent per task, then two-stage review (spec compliance, then code quality). The controller (you) builds each subagent's context; it never inherits your history.

Use when you have a plan with mostly independent tasks. Tightly coupled tasks or no plan: execute manually or brainstorm first. Never start on main/master without user consent.

## Setup

Read the plan once, extract every task's full text plus context, create todos.

## Per task

1. Dispatch implementer (`./implementer-prompt.md`) with the full task text and scene-setting context; don't make it read the plan. Answer its questions completely before it proceeds.
2. It implements, tests (TDD), commits, self-reviews.
3. Dispatch spec reviewer (`./spec-reviewer-prompt.md`). Issues → the same implementer fixes → re-review until compliant.
4. Only then dispatch code-quality reviewer (`./code-quality-reviewer-prompt.md`, see requesting-code-review for SHAs). Issues → fix → re-review until approved.
5. Mark the task complete.

After the last task: dispatch a final reviewer over the whole implementation, then use finishing-a-development-branch.

## Never

- Skip either review, skip a re-review, or proceed with open issues.
- Run quality review before spec review passes.
- Run implementers in parallel (conflicts).
- Fix a failed task yourself (context pollution); dispatch a fix subagent with specific instructions.
- Accept "close enough" on spec compliance or let self-review replace real review.
