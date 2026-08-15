# TODO workflow

For multi-step work, treat `PRD.md` as the source of truth and `TODO.md` as the
single backlog. Create or update `TODO.md` from the PRD and keep tasks in
execution order:

- [ ] `T001` Task title
  - Description: What to change and why.
  - Depends on: `none` or task IDs.
  - Done when: Verifiable acceptance criteria.

Before starting, read both files and work on the first unchecked task whose
dependencies are complete. Keep `TODO.md` current: add discovered work, reorder
tasks when dependencies change, and check off a task only after validation
passes. Ask the user before materially changing PRD scope or priorities.
