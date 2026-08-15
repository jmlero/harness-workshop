# TODO

- [ ] Add the Karpathy skills.
  - Identify the canonical source and license.
  - Distill only the workflows that fit the repository vision.
  - Add catalog metadata, attribution, lifecycle tests, and usage documentation.

- [ ] Add an agent memory block.
  - Add `catalog/blocks/memory.md` describing a project memory file (for example
    `agents/memory.md`) that agents append to themselves when they learn
    something durable and genuinely relevant: a non-obvious constraint, a
    decision and its reason, or a correction that would otherwise be relearned.
  - Define the entry format and the bar for writing one, so the file stays small
    and does not duplicate the code, git history, or `AGENTS.md`.
  - Add catalog metadata (stable ID, version, scope, source, context cost) and
    link the block from `AGENTS.md` alongside the other instruction modules.
  - Add lifecycle tests for install, drift detection, and preserving existing
    user entries, plus README coverage for the new block.

- [x] Add simple TODO instructions.
  - Added a small, portable workflow in `agents/todo-workflow.md` for creating,
    ordering, updating, and completing repository TODOs.
  - Linked the workflow from `AGENTS.md` so every repository agent follows it.

- [x] Verify Grok Build compatibility with Codex.
  - Portable instructions, skills, and explicit commands work in both.
  - `slim-cli` has a tested native Grok hook adapter.
  - Plugin, MCP, configuration, and subagent formats are not fully compatible;
    see [docs/grok-build-compatibility.md](docs/grok-build-compatibility.md).
