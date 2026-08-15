---
name: ponytail
description: Apply a focused simplification workflow to coding, fixes, refactoring, or design. Use when the user explicitly asks for Ponytail, minimalism, simplicity, YAGNI, less code, fewer dependencies, or removal of over-engineering. Never use minimalism to skip explicit requirements, correctness, security, validation, accessibility, or necessary verification.
---

# Ponytail

1. Trace the affected flow and callers; identify the current required outcome.
2. Stop at the first option that fully works:

   - delete or skip work with no current requirement;
   - reuse an existing project primitive;
   - use the standard library or a native platform feature;
   - reuse an installed dependency; or
   - implement the smallest clear change at the shared root cause.

3. Preserve explicit behavior and safety constraints. Add no dependency for a
   small clear solution. Leave the smallest runnable regression check for
   non-trivial logic.
4. Mark a deliberate shortcut only when it has a real ceiling:
   `ponytail: <ceiling>; upgrade when <measurable trigger>`.

Report what was intentionally skipped and the condition that would justify it.
Do not invent savings without a real baseline.
