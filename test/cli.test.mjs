import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repository, "bin", "harness-workshop.mjs");

test("non-interactive init records stack-aware defaults without executing external tools", (context) => {
  const fixture = makeFixture(context);
  const initialized = run(fixture, "init", "--yes", "--target", "codex");
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.match(initialized.stdout, /Manual steps \(not executed\)/);
  const manifest = JSON.parse(read(fixture.project, ".harness-workshop/manifest.json"));
  assert.deepEqual(manifest.targets, ["codex"]);
  assert.deepEqual(manifest.components.map(({ id }) => id), [
    "block/tdd",
    "skill/audit-code",
    "tool/code-review-graph",
    "tool/context7",
  ]);
  assert.ok(fs.existsSync(path.join(fixture.project, ".agents", "skills", "audit-code", "SKILL.md")));
  assert.equal(fs.existsSync(path.join(fixture.project, ".claude")), false);
});

test("installs, reconciles, and removes portable content without changing user text", (context) => {
  const fixture = makeFixture(context);
  fs.writeFileSync(path.join(fixture.project, "AGENTS.md"), "# Team instructions\n\nKeep this text.\n");
  fs.writeFileSync(path.join(fixture.project, "CLAUDE.md"), "# Claude notes\n");

  const installed = run(fixture, "add", "block/tdd", "skill/audit-code", "--target", "claude,codex");
  assert.equal(installed.status, 0, installed.stderr);
  const agents = read(fixture.project, "AGENTS.md");
  assert.match(agents, /Keep this text/);
  assert.equal(count(agents, "harness-workshop:start block/tdd"), 1);

  const claude = read(fixture.project, "CLAUDE.md");
  assert.match(claude, /# Claude notes/);
  assert.match(claude, /@AGENTS\.md/);
  assert.ok(fs.existsSync(path.join(fixture.project, ".agents", "skills", "audit-code", "SKILL.md")));
  if (process.platform !== "win32") {
    assert.equal(fs.lstatSync(path.join(fixture.project, ".claude", "skills", "audit-code")).isSymbolicLink(), true);
  }

  const planned = run(fixture, "plan");
  assert.equal(planned.status, 0, planned.stderr);
  assert.match(planned.stdout, /^No file changes\./);
  const healthy = run(fixture, "doctor");
  assert.equal(healthy.status, 0, healthy.stderr);
  assert.match(healthy.stdout, /Healthy: 2 components/);

  const repeated = run(fixture, "add", "block/tdd", "skill/audit-code");
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.match(repeated.stdout, /^No file changes\./);

  const removed = run(fixture, "remove", "block/tdd", "skill/audit-code");
  assert.equal(removed.status, 0, removed.stderr);
  const agentsAfter = read(fixture.project, "AGENTS.md");
  assert.match(agentsAfter, /Keep this text/);
  assert.doesNotMatch(agentsAfter, /harness-workshop:start/);
  const claudeAfter = read(fixture.project, "CLAUDE.md");
  assert.match(claudeAfter, /# Claude notes/);
  assert.doesNotMatch(claudeAfter, /@AGENTS\.md/);
});

test("detects drift and refuses destructive removal unless forced", (context) => {
  const fixture = makeFixture(context);
  const installed = run(fixture, "add", "skill/audit-code", "--target", "codex");
  assert.equal(installed.status, 0, installed.stderr);
  const skill = path.join(fixture.project, ".agents", "skills", "audit-code", "SKILL.md");
  fs.appendFileSync(skill, "\nLocal edit.\n");

  const doctor = run(fixture, "doctor");
  assert.equal(doctor.status, 1);
  assert.match(doctor.stderr, /local changes/i);
  const refused = run(fixture, "remove", "skill/audit-code");
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /local changes/i);
  assert.ok(fs.existsSync(skill));

  const forced = run(fixture, "remove", "skill/audit-code", "--force");
  assert.equal(forced.status, 0, forced.stderr);
  assert.equal(fs.existsSync(skill), false);
});

test("Claude marketplace edits preserve unrelated settings", (context) => {
  const fixture = makeFixture(context);
  fs.mkdirSync(path.join(fixture.project, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(fixture.home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(fixture.project, ".claude", "settings.json"), '{"permissions":{"allow":["Read"]}}\n');
  fs.writeFileSync(path.join(fixture.home, ".claude", "settings.json"), '{"theme":"dark"}\n');

  const installed = run(fixture, "add", "plugin/github", "--target", "claude");
  assert.equal(installed.status, 0, installed.stderr);
  const projectSettings = JSON.parse(read(fixture.project, ".claude/settings.json"));
  const userSettings = JSON.parse(read(fixture.home, ".claude/settings.json"));
  assert.deepEqual(projectSettings.permissions, { allow: ["Read"] });
  assert.equal(projectSettings.enabledPlugins["github@claude-plugins-official"], true);
  assert.equal(userSettings.theme, "dark");
  assert.equal(userSettings.extraKnownMarketplaces["claude-plugins-official"].source.repo, "anthropics/claude-plugins-official");

  const removed = run(fixture, "remove", "plugin/github");
  assert.equal(removed.status, 0, removed.stderr);
  const projectAfter = JSON.parse(read(fixture.project, ".claude/settings.json"));
  assert.deepEqual(projectAfter.permissions, { allow: ["Read"] });
  assert.equal(projectAfter.enabledPlugins, undefined);
});

test("installs and removes the opt-in Claude hook at user scope", (context) => {
  const fixture = makeFixture(context);
  const installed = run(fixture, "add", "hook/slim-cli", "--target", "claude");
  assert.equal(installed.status, 0, installed.stderr);
  const hook = path.join(fixture.home, ".claude", "hooks", "harness-workshop", "slim-cli.sh");
  assert.ok(fs.existsSync(hook));
  if (process.platform !== "win32") assert.ok((fs.statSync(hook).mode & 0o111) !== 0);
  const settings = JSON.parse(read(fixture.home, ".claude/settings.json"));
  assert.match(settings.hooks.PreToolUse[0].hooks[0].command, /slim-cli\.sh/);
  assert.match(run(fixture, "plan").stdout, /^No file changes\./);

  const removed = run(fixture, "remove", "hook/slim-cli");
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(fs.existsSync(hook), false);
  const after = JSON.parse(read(fixture.home, ".claude/settings.json"));
  assert.equal(after.hooks, undefined);
});

function makeFixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-workshop-cli-"));
  const project = path.join(root, "project");
  const home = path.join(root, "home");
  fs.mkdirSync(project);
  fs.mkdirSync(home);
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, project, home };
}

function run(fixture, ...arguments_) {
  return spawnSync(process.execPath, [cli, ...arguments_], {
    cwd: fixture.project,
    encoding: "utf8",
    env: { ...process.env, HOME: fixture.home },
  });
}

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function count(value, needle) {
  return value.split(needle).length - 1;
}
