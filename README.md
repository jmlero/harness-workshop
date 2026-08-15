# harness-workshop

An agent-agnostic CLI for installing portable project instructions, skills,
Claude plugins, hooks, and external-tool recommendations.

## Start

Requires Node.js 20 or newer.

```bash
npx github:jmlero/harness-workshop init
```

`init` detects the project stack and offers relevant components. Use `--yes`
for non-interactive defaults or `--dry-run` to preview without writing.

## Commands

```text
harness-workshop list
harness-workshop add block/tdd skill/review-pr
harness-workshop plan
harness-workshop remove skill/review-pr
harness-workshop update
harness-workshop doctor
```

Add `--target claude`, `--target codex`, or `--target claude,codex`. Project
scope is the default; supported components can use `--scope user`.

The CLI records desired state in `.harness-workshop/manifest.json` and pinned
versions and checksums in `.harness-workshop/lock.json`. It manages only marked
`AGENTS.md` blocks, refuses ambiguous or locally modified managed content, and
never executes external installation commands.

Portable skills live in `.agents/skills`. The Claude adapter links them from
`.claude/skills` and bridges `CLAUDE.md` to canonical `AGENTS.md` instructions.
Claude-only plugins and the opt-in `slim-cli` hook remain explicit. The hook
requires `jq`.

See [VISION.md](VISION.md) for the design principles. Licensed under
Apache-2.0.
