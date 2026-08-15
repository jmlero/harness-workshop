#!/usr/bin/env bash
# Adds quiet flags only when they preserve command semantics and error output.

set -euo pipefail

input=$(cat)
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // .toolName // empty')
[[ "$tool_name" == "Bash" || "$tool_name" == "run_terminal_command" ]] || exit 0

command=$(printf '%s' "$input" | jq -r '.tool_input.command // .toolInput.command // empty')
[[ -n "$command" ]] || exit 0

# Compound shell syntax is intentionally left unchanged. Appending a flag
# without a complete shell parser could attach it to the wrong command.
if [[ "$command" == *"|"* || "$command" == *"&"* || "$command" == *";"* \
  || "$command" == *"<"* || "$command" == *">"* || "$command" == *$'\n'* ]]; then
  exit 0
fi

rewritten=""

if [[ "$command" =~ ^git\ fetch ]] && [[ ! "$command" =~ (^|[[:space:]])(--quiet|-q)([[:space:]]|$) ]]; then
  rewritten="$command --quiet"
elif [[ "$command" =~ ^git\ clone ]] && [[ ! "$command" =~ (^|[[:space:]])(--quiet|-q)([[:space:]]|$) ]]; then
  rewritten="${command/git clone/git clone --quiet}"
elif [[ "$command" =~ ^pip[3]?\ install ]] && [[ ! "$command" =~ (^|[[:space:]])(--quiet|-q)([[:space:]]|$) ]]; then
  rewritten="$command --quiet"
elif [[ "$command" =~ ^python[3]?\ -m\ pip\ install ]] && [[ ! "$command" =~ (^|[[:space:]])(--quiet|-q)([[:space:]]|$) ]]; then
  rewritten="$command --quiet"
elif [[ "$command" =~ ^curl\  ]] \
  && [[ ! "$command" =~ (^|[[:space:]])-[^[:space:]]*s[^[:space:]]*([[:space:]]|$) ]] \
  && [[ ! "$command" =~ (^|[[:space:]])--silent([[:space:]]|$) ]]; then
  rewritten="${command/curl /curl -sS }"
elif [[ "$command" =~ ^wget\  ]] && [[ ! "$command" =~ (^|[[:space:]])(--quiet|-q)([[:space:]]|$) ]]; then
  rewritten="${command/wget /wget --quiet }"
fi

[[ -n "$rewritten" ]] || exit 0

if printf '%s' "$input" | jq -e 'has("toolName")' >/dev/null; then
  jq -n --arg command "$rewritten" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      updatedInput: { command: $command }
    }
  }'
else
  jq -n --arg command "$rewritten" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput: { command: $command }
    }
  }'
fi
