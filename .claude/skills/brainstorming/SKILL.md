---
name: brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior."
---

# Brainstorming

Turn an idea into an approved design before any implementation.

<HARD-GATE>No code, scaffolding or implementation skill until a design is presented and the user approves it. Applies to every project; a trivial one just gets a short design.</HARD-GATE>

## Steps (one todo each)

1. Explore project context (files, docs, recent commits).
2. If the request spans several independent subsystems, decompose into sub-projects first; brainstorm the first one (each gets its own spec → plan → implementation).
3. Ask clarifying questions one at a time (multiple choice preferred): purpose, constraints, success criteria.
4. Propose 2-3 approaches with trade-offs; lead with your recommendation.
5. Present the design in sections scaled to complexity (architecture, components, data flow, error handling, testing); get approval per section.
6. Write the spec to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit.
7. Self-review the spec inline: placeholders/TBDs, contradictions, scope (one plan?), ambiguity. Fix in place.
8. Ask the user to review the spec file; apply changes until approved.
9. Invoke writing-plans. It is the only skill invoked next.

## Principles

- Units with one clear purpose and well-defined interfaces; follow existing patterns; include only refactoring that serves the goal.
- YAGNI: remove unnecessary features from every design.
