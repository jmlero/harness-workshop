#!/usr/bin/env node
import os from "node:os";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { listComponents, requireComponent, suggested } from "../src/catalog.mjs";
import { detectStack, humanSummary } from "../src/detect.mjs";
import { formatPlan } from "../src/planner.mjs";
import { reconcile } from "../src/reconcile.mjs";
import {
  emptyManifest,
  jsonDocument,
  normalizeManifest,
  readLock,
  readManifest,
  statePaths,
} from "../src/state.mjs";

const version = "0.1.0";

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.flags.help) return printHelp();
  if (parsed.flags.version) return console.log(version);

  const cwd = process.cwd();
  const home = os.homedir();
  switch (parsed.command) {
    case "init":
      await initialize({ cwd, home, ...parsed });
      break;
    case "add":
      await add({ cwd, home, ...parsed });
      break;
    case "remove":
      await remove({ cwd, home, ...parsed });
      break;
    case "plan":
      await plan({ cwd, home, ...parsed });
      break;
    case "update":
      await update({ cwd, home, ...parsed });
      break;
    case "doctor":
      await doctor({ cwd, home, ...parsed });
      break;
    case "list":
      list(parsed.flags.targets);
      break;
    default:
      throw new Error(`Unknown command: ${parsed.command}`);
  }
}

async function initialize({ cwd, home, flags }) {
  const existing = readManifest(cwd);
  const detected = detectStack(cwd);
  const stack = humanSummary(detected);
  console.log(stack.length ? `Detected: ${stack.join(", ")}` : "Detected: no specific stack");

  let targets = flags.targets ?? existing?.targets ?? ["claude", "codex"];
  let defaultScope = flags.scope ?? "project";
  let selectedIds;

  const candidates = listComponents().filter((component) => targets.some((target) => component.targets.includes(target)));
  const defaults = candidates.filter((component) => suggested(component, detected).pick).map(({ id }) => id);

  if (flags.yes) {
    selectedIds = defaults;
    console.log(`Selected ${selectedIds.length} stack-aware recommendations.`);
  } else {
    if (!process.stdin.isTTY) throw new Error("Interactive init needs a terminal; use --yes or add components explicitly");
    const prompt = readline.createInterface({ input, output });
    try {
      targets = await chooseTargets(prompt, targets);
      defaultScope = flags.scope ?? await chooseScope(prompt, defaultScope);
      const filtered = listComponents().filter((component) => targets.some((target) => component.targets.includes(target)));
      selectedIds = await chooseComponents(prompt, filtered, detected);
    } finally {
      prompt.close();
    }
  }

  const byId = new Map((existing?.components ?? []).map((selection) => [selection.id, selection]));
  for (const id of selectedIds) {
    const component = requireComponent(id);
    byId.set(id, {
      id,
      scope: byId.get(id)?.scope ?? componentScope(component, defaultScope),
    });
  }
  const manifest = normalizeManifest({
    ...(existing ?? emptyManifest()),
    targets,
    components: [...byId.values()],
  });
  await applyDesired({ cwd, home, manifest, flags, writeManifest: true });
}

async function add({ cwd, home, flags, values }) {
  if (!values.length) throw new Error("Usage: harness-workshop add <component> [component...]");
  const existing = readManifest(cwd);
  const targets = flags.targets ?? existing?.targets ?? ["claude", "codex"];
  const byId = new Map((existing?.components ?? []).map((selection) => [selection.id, selection]));
  for (const id of values) {
    const component = requireComponent(id);
    byId.set(id, {
      id,
      scope: flags.scope ?? byId.get(id)?.scope ?? componentScope(component, "project"),
    });
  }
  const manifest = normalizeManifest({
    ...(existing ?? emptyManifest()),
    targets,
    components: [...byId.values()],
  });
  await applyDesired({ cwd, home, manifest, flags, writeManifest: true });
}

async function remove({ cwd, home, flags, values }) {
  if (!values.length) throw new Error("Usage: harness-workshop remove <component> [component...]");
  const existing = readManifest(cwd, { required: true });
  const installed = new Set(existing.components.map(({ id }) => id));
  const missing = values.filter((id) => !installed.has(id));
  if (missing.length) throw new Error(`Not installed: ${missing.join(", ")}`);
  const removed = new Set(values);
  const manifest = normalizeManifest({
    ...existing,
    components: existing.components.filter(({ id }) => !removed.has(id)),
  });
  await applyDesired({ cwd, home, manifest, flags, writeManifest: true });
}

async function plan({ cwd, home, flags }) {
  const manifest = readManifest(cwd, { required: true });
  const previousLock = readLock(cwd);
  const result = await reconcile({ cwd, home, manifest, previousLock, force: flags.force });
  const paths = statePaths(cwd);
  result.planner.write(paths.lock, jsonDocument(result.lock), { allowExisting: true });
  console.log(formatPlan(result.planner));
}

async function update({ cwd, home, flags }) {
  const manifest = readManifest(cwd, { required: true });
  await applyDesired({ cwd, home, manifest, flags, writeManifest: false, refreshRemote: true });
}

async function doctor({ cwd, home, flags }) {
  const manifest = readManifest(cwd, { required: true });
  const previousLock = readLock(cwd);
  const result = await reconcile({ cwd, home, manifest, previousLock, force: false });
  const lockMatches = jsonDocument(previousLock) === jsonDocument(result.lock);
  if (!result.planner.hasChanges() && lockMatches) {
    console.log(`Healthy: ${manifest.components.length} components match the manifest and lockfile.`);
    if (result.planner.notes.length) console.log("External tools are recorded as manual steps; their installation is not asserted.");
    return;
  }

  console.error("Drift or an available catalog update was detected:");
  console.error(formatPlan(result.planner));
  if (!lockMatches) console.error("Lockfile metadata differs from the catalog or manifest.");
  process.exitCode = 1;
}

function list(targets) {
  const components = listComponents().filter((component) => !targets
    || targets.some((target) => component.targets.includes(target)));
  for (const component of components) {
    console.log(`${component.id.padEnd(28)} ${component.targets.join(",").padEnd(13)} ${component.description}`);
  }
}

async function applyDesired({ cwd, home, manifest, flags, writeManifest, refreshRemote = false }) {
  const previousLock = readLock(cwd);
  const result = await reconcile({
    cwd,
    home,
    manifest,
    previousLock,
    force: flags.force,
    refreshRemote,
  });
  const paths = statePaths(cwd);
  if (writeManifest) result.planner.write(paths.manifest, jsonDocument(manifest), { allowExisting: true });
  result.planner.write(paths.lock, jsonDocument(result.lock), { allowExisting: true });

  console.log(formatPlan(result.planner));
  if (flags.dryRun) {
    console.log("Dry run: no files written and no external commands executed.");
    return;
  }
  result.planner.apply();
  console.log(`Applied ${result.planner.operations().length} file change(s).`);
}

function componentScope(component, requested) {
  if (component.recommendedScope && component.scopes.includes(component.recommendedScope)) {
    return component.recommendedScope;
  }
  if (component.scopes.includes(requested)) return requested;
  return component.scopes[0];
}

async function chooseTargets(prompt, defaults) {
  const answer = await prompt.question(`Targets [${defaults.join(",")}]: `);
  if (!answer.trim()) return defaults;
  const targets = answer.split(",").map((value) => value.trim()).filter(Boolean);
  const invalid = targets.filter((target) => !new Set(["claude", "codex"]).has(target));
  if (invalid.length || !targets.length) throw new Error(`Invalid targets: ${answer}`);
  return [...new Set(targets)];
}

async function chooseScope(prompt, fallback) {
  const answer = await prompt.question(`Default scope: project or user [${fallback}]: `);
  const scope = answer.trim() || fallback;
  if (!new Set(["project", "user"]).has(scope)) throw new Error(`Invalid scope: ${scope}`);
  return scope;
}

async function chooseComponents(prompt, components, detected) {
  const defaults = [];
  components.forEach((component, index) => {
    const recommendation = suggested(component, detected);
    if (recommendation.pick) defaults.push(index + 1);
    const marker = recommendation.pick ? "*" : " ";
    const reason = recommendation.pick ? ` — ${recommendation.reason}` : "";
    console.log(`${String(index + 1).padStart(2)}. ${marker} ${component.id}: ${component.description}${reason}`);
  });
  const answer = await prompt.question(`Select comma-separated numbers [${defaults.join(",")}]: `);
  const indexes = answer.trim() ? answer.split(",").map((value) => Number(value.trim())) : defaults;
  if (indexes.some((index) => !Number.isInteger(index) || index < 1 || index > components.length)) {
    throw new Error("Invalid component selection");
  }
  return [...new Set(indexes)].map((index) => components[index - 1].id);
}

function parseArguments(argv) {
  const flags = {
    dryRun: false,
    force: false,
    help: false,
    scope: null,
    targets: null,
    version: false,
    yes: false,
  };
  const values = [];
  let command = null;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "-h" || value === "--help") flags.help = true;
    else if (value === "--version") flags.version = true;
    else if (value === "-y" || value === "--yes") flags.yes = true;
    else if (value === "--dry-run") flags.dryRun = true;
    else if (value === "--force") flags.force = true;
    else if (value === "--scope" || value === "--target" || value === "--targets") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) throw new Error(`${value} requires a value`);
      index += 1;
      setValueFlag(flags, value, next);
    } else if (value.startsWith("--scope=")) setValueFlag(flags, "--scope", value.slice(8));
    else if (value.startsWith("--target=")) setValueFlag(flags, "--target", value.slice(9));
    else if (value.startsWith("--targets=")) setValueFlag(flags, "--targets", value.slice(10));
    else if (value.startsWith("-")) throw new Error(`Unknown flag: ${value}`);
    else if (!command) command = value;
    else values.push(value);
  }

  return { command: command ?? "init", flags, values };
}

function setValueFlag(flags, name, value) {
  if (name === "--scope") {
    if (!new Set(["project", "user"]).has(value)) throw new Error(`Invalid scope: ${value}`);
    flags.scope = value;
    return;
  }
  const targets = value.split(",").map((target) => target.trim()).filter(Boolean);
  if (!targets.length || targets.some((target) => !new Set(["claude", "codex"]).has(target))) {
    throw new Error(`Invalid targets: ${value}`);
  }
  flags.targets = [...new Set(targets)];
}

function printHelp() {
  console.log(`harness-workshop ${version}

Usage:
  harness-workshop init [--yes] [--target claude,codex]
  harness-workshop add <component...> [--scope project|user]
  harness-workshop plan
  harness-workshop remove <component...>
  harness-workshop update
  harness-workshop doctor
  harness-workshop list [--target claude|codex]

Options:
  -y, --yes       Use stack-aware defaults during init
  --dry-run       Print exact changes without writing
  --force         Replace drifted managed content
  --scope VALUE   Default project or user scope
  --target VALUE  Comma-separated claude and/or codex targets
  -h, --help      Show help
  --version       Show version

External tool commands are printed for review and never executed.`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
