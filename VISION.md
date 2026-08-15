# `harness-workshop` Vision

## The idea

`harness-workshop` is a personal, agent-agnostic toolkit for starting and shaping
software projects. From a new or existing repository, one CLI should be able to
install a curated set of:

- instruction blocks in `AGENTS.md`;
- on-demand skills;
- specialized agent definitions;
- automation hooks; and
- reusable profiles that combine them.

The goal is not to hide the underlying files. `harness-workshop` should create
small, readable, version-controlled artifacts that continue to work without the
CLI.

## Why it should exist

Every new project repeats the same setup: establish working agreements, copy
useful skills, configure agents, and wire up automation. Existing toolkits tend
to be tied to one agent, require manual installation, or load more instruction
text than the task needs.

`harness-workshop` should make the best parts of a personal development workflow
portable across projects and agents. It should favor focused instructions that
consume less context while preserving—or improving—task quality.

## The central thesis

Good agent guidance is not the longest or shortest prompt. It is the smallest
set of instructions that reliably produces the desired behavior.

`harness-workshop` will optimize for **task success per context token**, not
brevity alone. A compact skill still needs a precise trigger, a clear outcome,
essential safety constraints, a usable workflow, and a way to verify completion.
Detail that is only occasionally useful should be loaded on demand rather than
placed in every session.

Claims that a compact skill is better should be supported by repeatable
evaluations against representative tasks and, when applicable, its upstream
version.

## Product principles

### Agent-agnostic core, vendor-aware edges

`AGENTS.md` is the canonical project instruction file. Portable content is
defined once. Thin adapters translate capabilities into the conventions of
Claude Code, Codex, and other supported agents.

Portable content does not declare vendor targets. It installs canonically and
is available to every agent that reads the standard files. Adapters are
optional, explicit edges used only when an agent needs a bridge, alternate
layout, or native integration. Codex consumes `AGENTS.md` and `.agents/skills`
directly; the Claude adapter exposes those files through Claude conventions.

Portability does not mean pretending every agent has the same features:

- instruction blocks can usually be shared directly;
- skills can share core Markdown while adapters supply agent-specific metadata
  and install paths;
- agent definitions need a portable role and task contract plus optional native
  representations;
- hooks are capability-specific and must declare which agents they support.

When a feature has no native equivalent, `harness-workshop` should explain the
limitation and install a safe fallback where possible. It must not silently
claim portability.

For Claude Code, a project may expose the canonical instructions through a
`CLAUDE.md` symlink or another explicit compatibility bridge. Generated bridges
must make their source clear and avoid independent copies that can drift.

### Small by default, detailed on demand

Always-loaded project instructions have a strict context budget. Stable rules
belong in `AGENTS.md`; task-specific procedures belong in skills; large examples
and references belong in files loaded only when required.

Each package should state its expected context cost and justify always-on text.
Profiles should install only what the project needs, based on transparent stack
detection and user choice.

### Declarative and repeatable

A project records what `harness-workshop` installed in a small manifest and
lockfile. Every component has a stable ID, version, source, and integrity
information. Portable is the default; vendor-specific components declare their
supported adapters.

Operations must be:

- idempotent: applying the same configuration twice produces no extra changes;
- reversible: a component can be removed without damaging user-authored text;
- inspectable: users can preview the exact file changes before applying them;
- updateable: managed content can evolve without overwriting local content; and
- reproducible: a teammate or CI job can apply the same profile later.

Instruction blocks in `AGENTS.md` therefore need explicit managed boundaries.
`harness-workshop` should merge, replace, and remove blocks by ID rather than
append unstructured text.

### Safe and unsurprising

`harness-workshop` must preserve existing files and ask before resolving
ambiguous conflicts. Remote content should be pinned and attributable, with
checksums or a lockfile. Installation should never require executing unreviewed
code merely to inspect a package.

Hooks deserve extra caution. A hook that truncates output, rewrites a command,
or changes flags can hide a failure or alter behavior. Hooks must be opt-in,
target-specific, testable, and explicit about semantic changes. Saving tokens is
never a reason to discard information required to diagnose a problem.

### Personal first, useful to others

`harness-workshop` exists first to encode one opinionated workflow well. It
should not begin as a universal agent package manager. Its catalog can be public
and extensible, but a small coherent collection is more valuable than broad
support for uncurated packages.

## The intended experience

The CLI and its executable are named `harness-workshop`.

The CLI should make common workflows obvious:

```text
harness-workshop init                 # inspect the project and propose a profile
harness-workshop add block/tdd        # manage a block in AGENTS.md
harness-workshop add skill/review-pr  # install once in the canonical skill path
harness-workshop add agent/reviewer   # add a reusable specialist where supported
harness-workshop add hook/slim-cli    # install an explicit adapter-specific hook
harness-workshop plan                 # preview all changes
harness-workshop remove <component>   # cleanly undo a managed installation
harness-workshop update               # update pinned components with a visible diff
harness-workshop doctor               # detect drift, conflicts, and unsupported features
```

Interactive stack-aware suggestions are useful, but the resulting configuration
must also support non-interactive use in scripts and CI.

## What carries forward from `claude-toolkit`

The existing `claude-toolkit` proves several useful ideas:

- one command can inspect a repository and suggest relevant components;
- a manifest can act as the catalog's source of truth;
- dry runs and project/user scopes improve installation safety;
- context fragments, skills, hooks, plugins, and external tools need distinct
  installation behavior.

`harness-workshop` generalizes that foundation. Claude marketplace settings
become one adapter rather than the core model. `CLAUDE.md` context fragments
become managed `AGENTS.md` blocks. Skills are stored in a portable source form
and rendered to agent-native layouts. Agent-specific plugins and hooks remain
available without defining the whole architecture.

## Initial scope

The first port retains the complete useful `claude-toolkit` catalog, including
stack-aware suggestions, external-tool guidance, Claude marketplace entries,
and the opt-in `slim-cli` hook. Its core maturity priorities remain:

1. A package format and local catalog for instruction blocks and skills.
2. Idempotent `AGENTS.md` management with preview, removal, updates, and drift
   detection.
3. Canonical files that Codex can consume directly, plus a Claude adapter that
   exposes the same portable packages without maintaining separate copies.

The carried-over hook and vendor integrations must remain isolated adapters;
they do not justify adding new hooks, profiles, or agent definitions before the
portable content and installation model are stable.

## Explicit non-goals

- Normalizing every feature of every coding agent.
- Loading the full toolkit into every conversation.
- Automatically installing every recommended third-party tool.
- Replacing native package managers or agent marketplaces.
- Claiming that fewer tokens improve results without measurement.
- Mutating user-authored instructions that `harness-workshop` does not own.

## Risks to keep visible

- The lowest common denominator could make portable skills too weak. Shared
  content should remain expressive, with adapters adding capability rather than
  stripping it away.
- Excessive compression can remove the constraints that make a skill reliable.
  Context budgets need evaluations, not arbitrary line limits.
- A growing catalog can recreate the context and maintenance bloat
  `harness-workshop` is meant to solve. Every component needs a clear owner,
  trigger, and reason to exist.
- Upstream skills change. Forked compact versions require attribution, license
  compliance, version tracking, and periodic comparison.
- Symlinks and agent configuration paths are not equally portable across
  operating systems. Adapters need an explicit fallback strategy.
- The `harness-workshop` name still needs registry, executable, domain, and
  trademark checks before a public release.

## Definition of success

`harness-workshop` succeeds when:

- a new repository can adopt an opinionated agent setup in minutes;
- the proposed and applied changes are understandable from a normal Git diff;
- running the same installation twice produces no changes;
- every managed component can be updated or removed cleanly;
- projects pay context cost only for guidance relevant to the current task;
- one portable component works in at least two supported agents without
  maintaining separate copies of its core instructions; and
- compact skills match or outperform their reference versions in repeatable
  task evaluations while using materially less context.

The long-term outcome is a small, trusted toolbox that gives any supported agent
the right project knowledge at the right time—without turning the context window
into a dumping ground.
