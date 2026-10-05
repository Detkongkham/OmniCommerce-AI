---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
---

# Systematic Debugging

**No fixes without root-cause investigation first.** Applies to every failure, especially under time pressure or "obvious" one-line fixes.

## Phases (finish each before the next)

1. **Investigate**
   - Read errors and stack traces completely; reproduce reliably; check recent changes (git diff, deps, config).
   - Multi-component systems: log what enters/leaves each boundary, run once, find WHERE it breaks, then dig into that component.
   - Bad value deep in the stack: trace backward to its origin and fix at the source, not the symptom.
2. **Pattern analysis** - find similar working code, read the reference fully, list every difference, note dependencies/config.
3. **Hypothesis** - state one ("X is the cause because Y"), test it with the smallest change, one variable at a time. Wrong → new hypothesis, don't stack fixes. If you don't know, say so.
4. **Fix** - write a failing reproduction first (use test-driven-development), make one change for the root cause (no bundled refactors), verify the test passes and nothing else broke.

## 3+ failed fixes

Stop. Each fix revealing a new problem elsewhere signals an architecture problem. Discuss with the user before attempting another.

## Red flags → back to Phase 1

"Quick fix now, investigate later", "just try X", several changes at once, skipping the test, proposing fixes before tracing data flow, "one more attempt" after 2 failures.
