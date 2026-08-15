# TODO

- [x] `T017` Distill reusable App Meerkat guidance into portable blocks.
  - Description: Review every Markdown instruction under
    `/Users/jmolero/personal/github/app-meerkat/agents`, extract only concise
    behavior that is portable and not already represented in this catalog, and
    add it as directly managed `AGENTS.md` blocks. Exclude agent-specific
    orchestration, project-only setup, duplicated guidance, arbitrary limits,
    and narrow incident details. Preserve the Apache-2.0 source attribution.
  - Depends on: `none`.
  - Done when: Completion evidence, transparent shortcuts, secure defaults,
    CI/runtime parity, and unfinished UI are available as independently
    selectable blocks; task-specific CI triage and responsive verification are
    routed into on-demand workflows; all content retains stable metadata,
    attribution, README coverage, and lifecycle tests.

- [x] `T018` Apply the critical 2026-08-15 catalog audit.
  - Description: Review every catalog entry for relevance, context efficiency,
    overlap, lifecycle truthfulness, marketplace validity, and fit with the
    block-first product. Remove automatic installs, duplicate or task-specific
    always-loaded guidance, command-rewriting automation, broken or overlapping
    plugins, and external tools the CLI does not actually manage.
  - Depends on: `none` (explicitly prioritized by the user after the audit).
  - Done when: The curated catalog contains seven compact blocks, on-demand and
    explicit workflows, and five optional prerequisite-aware Claude
    integrations; invalid Terraform and Superpowers mappings, the duplicate
    Ponytail skill, `slim-cli`, and manual tool records are retired; current
    upstream mappings have verification dates; and regression tests pass.

- [x] `T001` Reframe the product around minimum durable guidance.
  - Description: Update `VISION.md` and `README.md` so concise, directly embedded
    `AGENTS.md` blocks are the first-class product. Position on-demand skills as
    the home for detailed workflows, references as supporting material, and
    vendor adapters as optional edges. State that a repository may need no
    additional harness and that guidance should shrink as model capability
    improves.
  - Depends on: `none`.
  - Done when: The product documents consistently describe the block-first
    model, the valid no-op outcome, and the goal of minimum guidance that agents
    cannot reliably infer from the repository.

- [x] `T002` Define the routing rule for guidance.
  - Description: Document and encode the decision between a direct block, an
    on-demand skill, a linked reference, and no component. Guidance needed for
    most repository changes belongs in a block; recognizable task workflows
    belong in skills; background detail belongs in references; facts reliably
    discoverable from code or configuration should not be installed.
  - Depends on: `T001`.
  - Done when: Contributors have one decision table and every guidance-bearing
    catalog component can be classified without relying on a vendor convention.

- [x] `T003` Establish the compact direct-block contract.
  - Description: Require each block to be atomic and directly installed in
    `AGENTS.md`, with a stable ID, version, scope, source, estimated context
    cost, clear behavioral outcome, and justification for always-on loading.
    Define a small target size, initially 30-150 estimated tokens, without
    allowing brevity to remove correctness or safety constraints.
  - Depends on: `T002`.
  - Done when: The catalog schema and runtime validation enforce the contract,
    managed markers still support safe install/update/remove/drift behavior,
    and focused tests cover invalid and valid blocks.

- [x] `T004` Remove mandatory linked instruction indirection.
  - Description: Stop using links to required files under `agents/` as a normal
    way to deliver always-loaded guidance. Inline small stable rules into
    `AGENTS.md`; move longer task procedures to skills; retain linked references
    only when they are genuinely optional or selectively loaded. Apply the same
    rule to this repository's own instruction modules as a self-hosting example.
  - Depends on: `T002`, `T003`.
  - Done when: Following the normal repository instructions requires no extra
    file read solely to recover mandatory short text, and any remaining linked
    material has a documented on-demand reason.

- [x] `T015` Make the Claude bridge symlink-first.
  - Description: Keep `AGENTS.md` as the canonical portable instruction file.
    When the Claude adapter is enabled, symlinks are supported, and no
    `CLAUDE.md` exists, create a `CLAUDE.md` symlink to `AGENTS.md` so ordinary
    edits through either name update the same document. Use a managed
    `@AGENTS.md` import only when symlinks are unavailable or an existing
    user-authored `CLAUDE.md` must be preserved. Refuse unrelated symlinks or
    ambiguous bridge state unless forced. Keep genuinely Claude-specific
    guidance under `.claude/`, rather than duplicating shared rules in the root
    bridge. Treat unmanaged text in an import-based `CLAUDE.md` as an
    intentional Claude-only overlay: explain that boundary, never copy it into
    `AGENTS.md` automatically, and give users a clear path to move portable
    guidance to the canonical file.
  - Depends on: `T001`.
  - Done when: New bridges prefer symlinks and fall back safely to imports;
    existing imports, user text, and valid symlinks remain intact; removal
    deletes only workshop-owned content; `doctor` detects a symlink replaced by
    a regular file, shows the divergence, and offers safe repair without
    treating valid Claude-only overlay text as drift; README and lifecycle tests
    cover creation, fallback, adoption, preservation, replacement, repair, and
    removal.

- [x] `T005` Make initialization assessment-first and allow a no-op result.
  - Description: Inspect new and existing repositories before recommending
    components. Remove the assumption that universal defaults must be installed,
    distinguish explicit selections from recommendations, and make "no guidance
    needed" a clear successful result in interactive and non-interactive flows.
  - Depends on: `T001`, `T002`.
  - Done when: `init` can complete without changing repository guidance, explains
    why each recommendation exists, never installs a block merely because it is
    in the catalog, and has regression coverage for empty and populated repos.

- [x] `T006` Add aggregate context and compatibility controls.
  - Description: Compute an exact word count from each block's normalized
    content and show it alongside the estimated token cost. Calculate aggregate
    word and token costs for the selected always-loaded blocks, surface them in
    list/selection/plan/apply output, and warn about excessive budgets,
    duplicate outcomes, ordering dependencies, or known conflicting blocks.
    Derive word counts instead of storing duplicate catalog metadata, document
    one deterministic counting rule for normalized Markdown, and keep semantic
    review explicit where it cannot be automated reliably.
  - Depends on: `T003`.
  - Done when: Users can see each block's exact word count and estimated tokens,
    plus the combined `AGENTS.md` cost, before applying a change; counts update
    automatically when content changes; focused tests cover counting and totals;
    and the CLI prevents or clearly reports declared incompatibilities without
    overwriting user-authored content.

- [x] `T016` Make the installer block-first and integrations second.
  - Description: Restructure the interactive installer into two clearly
    separated stages. Start with portable `AGENTS.md` blocks as the primary
    experience, with a concise numbered list, exact per-block word counts,
    estimated tokens, aggregate cost, evidence-based recommendations, and
    obvious `all`, `none`, number, and range selections. After the block
    decision, offer an optional agent-integration stage, disabled by default,
    where the user first chooses an agent and then sees only compatible plugins
    or other vendor-specific capabilities. Keep portable skills and commands
    available through direct `add` commands or an explicitly requested
    secondary workflow instead of mixing them into the main block selection.
  - Depends on: `T003`, `T005`, `T006`, `T015`.
  - Done when: A first-time user encounters blocks before any vendor choice;
    selecting no blocks is valid; selecting all blocks requires seeing and
    accepting their aggregate context cost and declared incompatibilities;
    agent plugins never appear without entering the optional integration stage;
    direct non-interactive component installation remains supported; and CLI
    tests cover block-only, all-block, no-op, Claude integration, and aborted
    integration flows.

- [x] `T007` Create an evaluation and deletion-pressure workflow.
  - Description: Compare representative tasks with no component and with the
    candidate guidance, measuring useful behavior against always-loaded context
    cost. Define periodic review outcomes: retain, shorten, demote from block to
    skill, replace, or remove. Do not treat token count alone as evidence of
    quality.
  - Depends on: `T001`, `T002`, `T003`.
  - Done when: The repository contains a repeatable evaluation format, at least
    one block has a recorded baseline comparison, and catalog maintenance
    documentation requires a deletion/demotion decision during review.

- [x] `T008` Audit and reclassify the existing catalog.
  - Description: Apply the routing and evaluation rules to all current blocks,
    skills, commands, hooks, plugins, and tools. Keep only broadly useful stable
    rules always loaded, move detailed procedures on demand, remove redundant or
    inferable guidance, and preserve upstream licensing and attribution.
  - Depends on: `T004`, `T005`, `T006`, `T007`.
  - Done when: Every catalog component has a documented reason for its form and
    loading behavior, unconditional block recommendations have evidence, and
    catalog lifecycle tests pass after any migrations or removals.

- [x] `T009` Simplify the CLI experience around direct blocks.
  - Description: Make inspecting, previewing, adding, updating, and removing
    concise `AGENTS.md` blocks the clearest path through the CLI while retaining
    skills and adapters as secondary capabilities. Keep normal output compact
    and reserve exact bodies for `plan` and `--dry-run`.
  - Depends on: `T005`, `T006`, `T008`, `T015`, `T016`.
  - Done when: A user can understand the proposed blocks, individual and total
    context cost, ownership boundaries, and no-op option before installation;
    README examples and CLI tests match the resulting workflow.

- [x] `T010` Add end-to-end coverage for the block-first model.
  - Description: Add regression tests for direct insertion beside user-authored
    text, stable ordering, idempotency, drift refusal, forced replacement,
    removal, no-op initialization, aggregate budgets, incompatibilities, and
    migrations away from mandatory linked instruction modules.
  - Depends on: `T003`, `T004`, `T005`, `T006`, `T009`, `T015`.
  - Done when: Focused lifecycle tests and `npm run check` pass, with no test
    relying on vendor adapters for portable block behavior.

- [x] `T011` Evaluate and add the Karpathy skills.
  - Description: Identify the canonical source and license, apply the routing
    rule, and distill only workflows that demonstrate value beyond what current
    models and repository context already provide.
  - Depends on: `T007`, `T008`.
  - Done when: Accepted components have catalog metadata, attribution,
    evaluation evidence, lifecycle tests, and usage documentation; rejected
    candidates have a recorded reason for installing nothing.

- [x] `T012` Evaluate and, if justified, add an agent memory block.
  - Description: Determine whether a small always-on rule for durable project
    memory earns its context cost. If so, define a compact entry format and a
    high bar for recording non-obvious constraints, decisions and reasons, or
    corrections that would otherwise be relearned. It must not duplicate code,
    Git history, or `AGENTS.md`.
  - Depends on: `T003`, `T006`, `T007`, `T008`.
  - Done when: Evaluation supports either a no-op decision or an atomic managed
    block with stable metadata, safe preservation of user entries, lifecycle
    tests, and README coverage.

- [x] `T013` Add simple TODO instructions.
  - Description: Added a small, portable workflow in
    `AGENTS.md` for ordering, updating, and completing repository TODOs. It uses
    `VISION.md` when the repository has no `PRD.md`.
  - Depends on: `none`.
  - Done when: The workflow is directly available in `AGENTS.md` and used as
    the repository's single backlog convention without mandatory indirection.

- [x] `T014` Verify Grok Build compatibility with Codex.
  - Description: Verified portable instructions, skills, and explicit commands;
    documented gaps in plugin, MCP, configuration, hook, and subagent
    compatibility. The previously tested `slim-cli` edge was later retired by
    `T018` because command rewriting did not justify its maintenance surface.
  - Depends on: `none`.
  - Done when: The tested support matrix is recorded in
    `docs/grok-build-compatibility.md` and the compatibility checks pass.
