import path from "node:path";

const hookCommand = "harness-workshop/slim-cli.sh";

export function grokHook({ scope, cwd, home }) {
  const root = scope === "user" ? home : cwd;
  const directory = path.join(root, ".grok", "hooks");
  return {
    command: hookCommand,
    config: path.join(directory, "harness-workshop.json"),
    script: path.join(directory, "harness-workshop", "slim-cli.sh"),
  };
}

export function grokHookDocument() {
  return `${JSON.stringify({
    hooks: {
      PreToolUse: [{
        matcher: "Bash",
        hooks: [{ type: "command", command: hookCommand, timeout: 5 }],
      }],
    },
  }, null, 2)}\n`;
}

export function grokCommandBridge({ component, scope, cwd, home, canonical }) {
  const root = scope === "user" ? home : cwd;
  const name = component.id.slice("command/".length);
  const file = path.join(root, ".grok", "skills", name, "SKILL.md");
  const target = path.relative(path.dirname(file), canonical).split(path.sep).join("/");
  const content = [
    "---",
    `name: ${name}`,
    `description: ${JSON.stringify(component.description)}`,
    "disable-model-invocation: true",
    "---",
    "",
    `Follow the canonical workflow in [${name}](${target}).`,
    "",
  ].join("\n");
  return { file, content };
}
