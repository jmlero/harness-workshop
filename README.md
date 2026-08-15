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
Portable content installs canonically in `AGENTS.md` and `.agents/skills` with
no vendor selection required.

Add `--adapter claude` only when the project also needs Claude bridges and
integrations. Codex reads the canonical files directly.

## Commands

```text
harness-workshop list
harness-workshop add block/tdd skill/review-pr
harness-workshop plan
harness-workshop remove skill/review-pr
harness-workshop update
harness-workshop doctor
```

Project scope is the default; supported components can use `--scope user`.
Claude-only plugins and hooks enable their required adapter automatically.

The CLI records desired components and optional adapters in
`.harness-workshop/manifest.json`, with pins and checksums in
`.harness-workshop/lock.json`. It manages only marked `AGENTS.md` blocks,
refuses ambiguous or locally modified managed content, and never executes
external installation commands.

The Claude adapter links canonical skills from `.claude/skills` and bridges
`CLAUDE.md` to `AGENTS.md`. The opt-in `slim-cli` hook requires `jq`.

See [VISION.md](VISION.md) for the design principles. Licensed under
Apache-2.0.
