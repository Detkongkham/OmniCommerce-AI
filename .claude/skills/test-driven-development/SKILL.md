---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code
---

# Test-Driven Development

**No production code without a failing test first.** Code written before its test: delete it and start over (no "reference", no adapting). Exceptions (throwaway prototypes, generated code, config) need the user's OK.

## Cycle

1. **RED** - one minimal test for one behavior, clear name, real code (mocks only if unavoidable). Run it; confirm it FAILS for the expected reason (feature missing, not a typo). A test that passes immediately proves nothing.
2. **GREEN** - the simplest code that passes. No extra features or refactoring. Run all tests; they must pass with clean output.
3. **REFACTOR** - only when green: remove duplication, improve names, keep tests green.
4. Repeat per behavior. Bug fix = failing test reproducing the bug first.

## Good tests

Minimal (one behavior; "and" in the name means split), clear, show intent. Test behavior, not mocks; don't add test-only methods to production classes; understand a dependency before mocking it.

## Red flags → delete code, restart with TDD

Code before test, test passes immediately, "I'll test after", "already manually tested", "too simple to test", "keep it as reference", "TDD is dogmatic". Tests-after answer "what does this do?", tests-first answer "what should it do?".

Stuck: can't write the test → the interface is unclear, write the API you wish existed; test too complex → simplify the design; must mock everything → too much coupling.

Done checklist: every function has a test that was seen failing first, minimal code, all pass, edge cases and errors covered.
