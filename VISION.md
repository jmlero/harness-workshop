# `harness-workshop` vision

## The idea

`harness-workshop` adds the minimum durable agent guidance that a repository
actually needs. Its first-class product is a library of short, independently
selectable instruction blocks installed directly in `AGENTS.md`.

The CLI may also install on-demand skills, explicit workflow commands, and
optional agent-native integrations. Those are secondary surfaces. A repository
that already explains itself and needs no extra guidance is a successful no-op,
not an incomplete installation.

The generated files remain small, readable, version-controlled, and useful
without the CLI.

## Central thesis

Good guidance is the smallest set of instructions that reliably changes task
outcomes for the better.

The product optimizes for task success per context token, not brevity alone. A
short rule must still preserve correctness and safety. As models gain reliable
capabilities, the corresponding harness should shrink: shorten the guidance,
move it on demand, or delete it.

Recommendations require a repository signal and eventually evaluation evidence.
Nothing is installed merely because it exists in the catalog.

## Guidance routing

| Surface | Correct use | Loading |
|---|---|---|
| Direct block | Atomic behavior needed across most relevant repository changes | Always through `AGENTS.md` |
| Skill | A recognizable task with a procedure, examples, or references | On demand |
| Command | A workflow that should run only when explicitly invoked | Explicit |
| Reference | Background detail used by a skill, not a standalone behavior | Selective |
| Integration | Vendor-native capability with an operational prerequisite | Optional and agent-specific |
| Nothing | Facts or behavior reliably inferable from code, configuration, or current models | No context cost |

A block must declare a stable ID, semantic version, project scope, source,
loading mode, behavioral outcome, and reason it deserves always-loaded context.
Its exact word count and token estimate are derived from normalized content.

Task-specific guidance does not become a block merely because it is short.
Background information does not become a skill merely because a file exists.

## Product principles

### Block-first, agent-agnostic core

`AGENTS.md` is the canonical portable project instruction file. Blocks are
defined once and embedded directly, without mandatory links whose only purpose
is recovering a few lines of required text.

Portable skills and commands live in `.agents/skills`. Codex and Grok Build use
the canonical files directly. Thin adapters expose them to other agents without
duplicating the core content.

For Claude Code, `CLAUDE.md` should be a symlink to `AGENTS.md` when a new bridge
can be created safely. An existing user-authored `CLAUDE.md` is preserved and
receives a managed `@AGENTS.md` import instead. Claude-only guidance remains an
intentional overlay rather than being copied into the portable file.

### Assessment before installation

Initialization starts with portable blocks. Users see each block's exact word
count and estimated token cost, then choose numbers, ranges, `all`, or `none`.
Selecting all requires seeing and accepting the aggregate cost.

Only after the block decision may the user enter the optional integration
stage, choose an agent, and inspect compatible plugins. Skills and commands stay
available through explicit `add` operations or a deliberately requested
secondary catalog workflow.

Non-interactive assessment never interprets a recommendation as consent to
modify the repository.

### Context is a maintained budget

Always-loaded rules must be atomic, concise, and broadly applicable to the
repositories that adopt them. Detailed procedures and current framework
knowledge belong on demand. Large examples and references are loaded only when
needed.

The CLI shows individual and aggregate context costs before applying blocks.
Catalog review applies deletion pressure: retain, shorten, demote, replace, or
remove each component.

### Declarative and reversible

Every managed component has a stable identity, source, version, scope, and
integrity record. Operations are idempotent, reversible, inspectable,
updateable, and reproducible.

`AGENTS.md` uses compact ownership boundaries. Versions and checksums live in
the lockfile rather than being repeated inside the prompt. Legacy boundaries
remain readable for safe migration.

The CLI never overwrites unowned content. Ambiguous ownership or local drift is
reported and requires explicit resolution.

### Integrations tell the operational truth

Plugins are settings and runtime integrations, not prompt components. They must
declare the agent they support, current marketplace identity, last verification
date, and required executables. The CLI must not call an integration healthy
when a known prerequisite is absent.

External products that the CLI merely recommends are not managed components.
They belong outside the desired-state manifest until the CLI can install,
verify, update, and remove them honestly.

### Small coherent catalog

The catalog exists first to encode one trusted workflow well. Similar tools are
not carried as undifferentiated alternatives. Broad methodology bundles are not
combined with overlapping local rules without explicit conflict handling and
evidence that the combination helps.

Remote content is pinned, attributable, license-preserving, bounded, and loaded
on demand.

## Intended experience

```text
harness-workshop init                       # assess blocks, optionally integrations
harness-workshop init --yes                 # assess and leave unchanged
harness-workshop list blocks                # see exact word/token costs
harness-workshop add block/completion-evidence
harness-workshop add skill/verify-frontend
harness-workshop add command/verify-work
harness-workshop add plugin/github          # optional Claude edge
harness-workshop plan                       # preview exact changes
harness-workshop remove <component>         # remove only owned state
harness-workshop update                     # refresh visible, pinned content
harness-workshop doctor                     # detect drift and missing prerequisites
```

Normal output is compact and sectioned. Exact bodies are reserved for `plan`
and `--dry-run`.

## Explicit non-goals

- Becoming a universal agent package manager.
- Installing universal defaults into every repository.
- Loading detailed task procedures in every session.
- Treating every third-party recommendation as managed state.
- Normalizing agent-native features that have no safe equivalent.
- Claiming fewer tokens improve results without representative evaluation.
- Mutating user-authored instructions that the workshop does not own.

## Risks to keep visible

- Over-compression can remove constraints that make guidance reliable.
- Weak recommendation signals can turn optional policy into accidental defaults.
- A growing catalog can recreate the context and maintenance bloat it opposes.
- Marketplace identifiers, prerequisites, and remote skills change over time.
- Symlinks are not equally portable; bridges require a safe import fallback.
- The `harness-workshop` name still needs registry, executable, domain, and
  trademark checks before public release.

## Definition of success

`harness-workshop` succeeds when:

- a user encounters concise portable blocks before any vendor choice;
- selecting nothing is a clear, successful outcome;
- every block exposes its individual and aggregate context cost;
- the same installation applied twice produces no changes;
- every managed component can be inspected, updated, and removed safely;
- agent integrations remain optional and verify known prerequisites;
- portable content works in multiple agents without duplicated core text; and
- periodic evaluation causes obsolete guidance to shrink or disappear.
