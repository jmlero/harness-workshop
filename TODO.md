# TODO

- [ ] Add the Karpathy skills.
  - Identify the canonical source and license.
  - Distill only the workflows that fit the repository vision.
  - Add catalog metadata, attribution, lifecycle tests, and usage documentation.

- [x] Add simple TODO instructions.
  - Added a small, portable workflow in `agents/todo-workflow.md` for creating,
    ordering, updating, and completing repository TODOs.
  - Linked the workflow from `AGENTS.md` so every repository agent follows it.

- [x] Verify Grok Build compatibility with Codex.
  - Portable instructions, skills, and explicit commands work in both.
  - `slim-cli` has a tested native Grok hook adapter.
  - Plugin, MCP, configuration, and subagent formats are not fully compatible;
    see [docs/grok-build-compatibility.md](docs/grok-build-compatibility.md).
