import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repository, "adapters", "claude", "hooks", "slim-cli", "slim-cli.sh");
const hasJq = spawnSync("jq", ["--version"]).status === 0;

test("slim-cli adds safe flags and leaves semantic or truncating commands alone", { skip: !hasJq }, () => {
  const fetch = invoke("git fetch origin");
  assert.equal(fetch.status, 0, fetch.stderr);
  assert.equal(JSON.parse(fetch.stdout).hookSpecificOutput.updatedInput.command, "git fetch origin --quiet");

  for (const command of [
    "git pull",
    "git diff",
    "go test ./...",
    "docker compose logs api",
    "git fetch origin && echo done",
  ]) {
    const result = invoke(command);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "", command);
  }

  const controlled = invoke("curl -sS https://example.com");
  assert.equal(controlled.status, 0, controlled.stderr);
  assert.equal(controlled.stdout, "");
});

function invoke(command) {
  return spawnSync("bash", [script], {
    encoding: "utf8",
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
  });
}
