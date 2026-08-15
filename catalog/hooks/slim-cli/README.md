# slim-cli

An opt-in Claude Code and Grok Build `PreToolUse` hook installed by
`harness-workshop add hook/slim-cli --adapter <claude|grok>`.

It adds quiet flags to known commands while retaining error output. It never
adds pipes, truncates output, or changes Git merge or rebase behavior. Commands
with output controls are unchanged. Requires `jq`.
