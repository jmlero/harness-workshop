# AGENTS.md

Applies to the entire repository.

## Project

`harness-workshop` is a dependency-free Node.js 20+ ESM CLI. `catalog/` owns
portable content; `adapters/` contains vendor-specific behavior; `src/` owns
planning, installation, state, and drift detection.

## Rules

- Keep changes focused and preserve existing user work.
- Define portable instructions once; keep adapters thin and capability-specific.
- Add catalog components declaratively with stable IDs, versions, scopes,
  sources, and context costs. Declare adapters only for vendor-specific edges.
- Keep normal CLI output compact and sectioned; reserve exact file bodies for
  `plan` and `--dry-run`.
- Never overwrite unowned content or hide unsupported behavior.
- Preserve Apache-2.0 metadata and upstream attribution.
- Update `README.md` for user-visible behavior or commands.

## Workflow

For multi-step work, use `PRD.md` as the product source when present and
`VISION.md` otherwise. Keep `TODO.md` as the single ordered backlog. Work on the
first unchecked task whose dependencies are complete, keep task dependencies
current, and check off work only after its acceptance criteria pass. Ask before
materially changing product scope or priorities.

## Validation

Run `npm test` for focused work and `npm run check` before handoff. Add regression
coverage for lifecycle, adapter, conflict, or detection changes.
