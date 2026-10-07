---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

Write the plan for an engineer with zero codebase context: exact files, complete code, exact commands with expected output. DRY, YAGNI, TDD, frequent commits.

Save to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`. If the spec covers independent subsystems, split into one plan per subsystem, each producing working, testable software.

## Structure

1. Header: `# <Feature> Implementation Plan`, then `> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.`, then **Goal** (1 sentence), **Architecture** (2-3 sentences), **Tech Stack**.
2. File map first: which files are created/modified and each one's single responsibility.
3. Tasks: `### Task N: <component>` with **Files** (Create/Modify with line ranges/Test) and bite-sized checkbox steps (2-5 min each): failing test → run (expect FAIL) → minimal implementation → run (expect PASS) → commit.

## No placeholders

Never write: TBD/TODO, "add error handling/validation", "write tests for the above" without test code, "similar to Task N" (repeat the code), steps without code, or references to undefined types/functions.

## Self-review (inline, no subagent)

Every spec requirement maps to a task; no placeholders; names/signatures consistent across tasks. Fix gaps inline.

## Handoff

Offer: **1. Subagent-driven (recommended)** → superpowers:subagent-driven-development, or **2. Inline** → superpowers:executing-plans.
