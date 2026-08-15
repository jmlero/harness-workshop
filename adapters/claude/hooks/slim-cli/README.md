# slim-cli

An opt-in Claude Code `PreToolUse` hook installed by
`harness-workshop add hook/slim-cli`.

It adds quiet flags to known commands while retaining error output. It never
adds pipes, truncates output, or changes behavior such as Git merge/rebase mode.
Commands already using output controls are unchanged. The hook requires `jq`.
