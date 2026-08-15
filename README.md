# harness-workshop

An agent-agnostic CLI for shaping a repository's instructions, skills, commands,
automation, and integrations.

## Start

Requires Node.js 20 or newer.

```bash
npx github:jmlero/harness-workshop init
```

`init` detects the stack and opens a sectioned workshop with relevant choices.
Use `--yes` for non-interactive defaults or `--dry-run` for an exact preview.
Portable content installs in `AGENTS.md` and `.agents/skills` without selecting
an agent vendor.

Codex and Grok Build read the canonical files directly. Add `--adapter claude`
for Claude bridges and integrations, or `--adapter grok` for Grok-specific
edges such as hooks.

## Workshop sections

| Section | Example | Result |
|---|---|---|
| Instruction blocks | `block/tdd` | Managed, always-on text in `AGENTS.md` |
| Skills | `skill/review-pr` | On-demand expertise in `.agents/skills` |
| Commands | `command/verify-work` | `$verify-work` in Codex; `/verify-work` in Grok |
| Hooks | `hook/slim-cli` | Opt-in, adapter-specific automation |
| Integrations | `plugin/github` | Vendor-native plugins and language servers |
| External tools | `tool/code-review-graph` | Reviewable manual setup instructions |

Claude exposes installed commands as `/verify-work` when its adapter is enabled.

## CLI

```text
harness-workshop list
harness-workshop list commands
harness-workshop add                       # interactive catalog
harness-workshop add block/tdd skill/review-pr
harness-workshop add command/verify-work
harness-workshop plan
harness-workshop remove skill/review-pr
harness-workshop update
harness-workshop doctor
```

Project scope is the default; supported components can use `--scope user`.
Vendor-specific components enable their default adapter automatically; use
`--adapter` when selecting a particular host for a multi-host component.
`block/ponytail` keeps minimal implementation rules always active;
`skill/ponytail` adds the detailed workflow on demand.

Normal installs show a compact component and file summary. `plan` and
`--dry-run` show exact content changes. The CLI records desired components in
`.harness-workshop/manifest.json`, with pins and checksums in
`.harness-workshop/lock.json`. It manages only marked `AGENTS.md` blocks,
refuses ambiguous or locally modified managed content, and never executes
external installation commands. Remote skills are pinned to an immutable
revision and installed with their declared references and upstream license.

The Claude adapter links canonical skills and commands from `.claude/skills`
and bridges `CLAUDE.md` to `AGENTS.md`. The Grok adapter installs the opt-in
`slim-cli` hook in `.grok/hooks`; it requires `jq`.

See [Grok Build compatibility](docs/grok-build-compatibility.md) for the tested
support matrix and [VISION.md](VISION.md) for the design principles. Licensed
under Apache-2.0; adapted components retain their upstream notices in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
