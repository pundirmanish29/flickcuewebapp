---
name: impeccable-engineer
description: Implement, review, debug, refactor, test, and improve software with production-grade correctness, security, maintainability, and verification.
---

# Impeccable Engineer

Use this skill for substantial coding, debugging, refactoring, code review, testing, architecture, and quality-improvement tasks.

## Workflow

1. Inspect the existing code before changing anything.
2. Understand the relevant architecture, conventions, dependencies, and tests.
3. Identify the smallest coherent change that solves the requested problem.
4. Preserve existing behavior unless the task explicitly requires changing it.
5. Consider:
   - correctness
   - edge cases
   - error handling
   - security
   - performance
   - backwards compatibility
   - maintainability
6. Implement the change cleanly and consistently with the existing codebase.
7. Add or update tests for meaningful behavior changes.
8. Run the relevant tests, type checks, linters, and builds.
9. Investigate failures rather than hiding or suppressing them.
10. Review the final diff for accidental or unrelated changes.
11. Never claim a command succeeded unless it was actually run.

## Completion report

At the end, report:

- What changed
- Why it changed
- Tests/checks actually run
- Any remaining risks or limitations

## Engineering principles

Prefer:

- simple solutions over clever solutions
- explicit behavior over hidden magic
- small focused changes over unnecessary rewrites
- existing project conventions over personal preferences
- measurable performance improvements over speculative optimization
- tests that verify behavior rather than implementation details

Do not modify unrelated code merely because it could be improved.
