# harness-workshop

A dependency-free Node.js CLI for adding the minimum useful agent guidance to a
new or existing repository.

Concise, portable instruction blocks are the first-class product. They are
installed directly in `AGENTS.md`, work without the CLI afterward, and remain
independently selectable. Skills and commands are secondary, on-demand
workflows. Agent-specific plugins are an optional final stage.

A successful assessment may install nothing. As models improve, guidance that
no longer changes outcomes should be shortened, moved on demand, or removed.

## Start

Requires Node.js 20 or newer.

```bash
npx github:jmlero/harness-workshop init
```

Interactive initialization follows two stages:

1. Inspect and select portable `AGENTS.md` blocks, including `all` and `none`.
   Every block shows its exact word count and derived token estimate; the total
   is shown before all blocks are accepted.
2. Optionally choose an agent and configure compatible integrations. This stage
   is disabled by default.

`init --yes` performs the assessment non-interactively but installs no
recommendations automatically. Use `add` for an explicit non-interactive
selection.

```bash
harness-workshop list blocks
harness-workshop add block/completion-evidence block/ponytail
harness-workshop add skill/review-pr
harness-workshop add command/verify-work
harness-workshop add plugin/github
```

## What belongs where

| Surface | Use it for | Example |
|---|---|---|
| Block | A short repository rule needed across most relevant changes | `block/completion-evidence` |
| Skill | A recognizable task with a procedure or references | `skill/verify-frontend` |
| Command | A workflow the user invokes explicitly | `command/verify-work` |
| Integration | An optional agent-native capability | `plugin/github` |
| Nothing | Behavior the model can infer reliably from the repository | No component |

Portable facts are defined once. Blocks install in `AGENTS.md`; skills and
commands install in `.agents/skills`. Codex and Grok Build consume those paths
directly. The Claude adapter creates a `CLAUDE.md -> AGENTS.md` symlink when it
can, preserves an existing `CLAUDE.md` by adding a small `@AGENTS.md` import,
and links canonical skills from `.claude/skills`.

`AGENTS.md` remains canonical in both bridge modes. Text outside the managed
import in an existing `CLAUDE.md` is an intentional Claude-only overlay and is
not copied into `AGENTS.md`. Move any portable rule to `AGENTS.md` yourself. If
an owned symlink is replaced by a regular file, `doctor` previews a safe repair
that preserves the file and adds the import; `update` applies it. An unrelated
symlink is refused unless `--force` is explicit.

## Portable block library

| Block | Purpose |
|---|---|
| `block/tdd` | Red-Green-Refactor development |
| `block/ponytail` | Smallest safe implementation |
| `block/completion-evidence` | Prove checks ran before claiming completion |
| `block/transparent-shortcuts` | Make material deferred work visible |
| `block/secure-defaults` | Protect new external boundaries by default |
| `block/ci-production-parity` | Keep CI and production execution aligned |
| `block/no-unfinished-ui` | Omit unavailable product paths |

The CLI normalizes line endings, trims the Markdown, and counts whitespace-
separated words. Its token estimate is the normalized UTF-8 byte length divided
by four and rounded up. These costs are derived rather than duplicated in
catalog metadata. Run `harness-workshop list blocks` for current values.

## Secondary workflows

Bundled skills cover code audits, documentation audits, pull-request reviews,
and frontend verification. Version-aware FastAPI and Terraform skills are
downloaded only when explicitly selected, pinned to an immutable revision, and
installed with their references and upstream license.

`command/verify-work` and `command/commit-work` are explicit Agent Skills.
Codex exposes them as `$verify-work` and `$commit-work`; Claude and Grok expose
the compatible slash-command form when their adapter is enabled.

## Optional integrations

The curated Claude integrations are frontend-design, GitHub, TypeScript LSP,
Pyright LSP, and Codex delegation. Integrations are never part of the automatic
assessment result. Language-server plugins require their corresponding
executable, and the Codex plugin requires an existing `codex` command; the CLI
checks these prerequisites before editing Claude settings.

External products that the CLI does not install, verify, update, and remove are
not represented as managed components.

## CLI

```text
harness-workshop init [--interactive|--yes] [--adapter claude|grok]
harness-workshop list [blocks|skills|commands|integrations]
harness-workshop add [component...] [--scope project|user]
harness-workshop plan
harness-workshop remove <component...>
harness-workshop update
harness-workshop doctor
```

Normal output stays compact. `plan` and `--dry-run` show exact file bodies and
diffs. The CLI records desired components in
`.harness-workshop/manifest.json`, with pins and integrity information in
`.harness-workshop/lock.json`.

Managed `AGENTS.md` blocks use compact ID boundaries. Version and checksum
metadata stays in the lockfile instead of consuming prompt context. Legacy
verbose markers remain readable and migrate safely on the next update. The CLI
never overwrites unowned content and refuses locally modified managed content
unless `--force` is explicit.

See [Grok Build compatibility](docs/grok-build-compatibility.md) for the tested
support matrix, [catalog maintenance](docs/catalog-maintenance.md) for the
evaluation and deletion-pressure workflow, and [the current catalog
review](docs/catalog-review-2026-08-15.md) for each component's form and loading
rationale, including evaluated Karpathy-guideline and agent-memory candidates
that intentionally install nothing. [VISION.md](VISION.md) contains the product
principles. Licensed under Apache-2.0; adapted content retains its upstream
notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
