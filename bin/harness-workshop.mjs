#!/usr/bin/env node
import os from "node:os";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  availableWithAdapters,
  isPortable,
  listComponents,
  requireComponent,
  suggested,
} from "../src/catalog.mjs";
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
  supportedAdapters,
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
      list(parsed.flags.adapters);
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

  let adapters = flags.adapters ?? existing?.adapters ?? [];
  let defaultScope = flags.scope ?? "project";
  let selectedIds;

  const candidates = listComponents().filter((component) => availableWithAdapters(component, adapters));
  const defaults = candidates.filter((component) => suggested(component, detected).pick).map(({ id }) => id);

  if (flags.yes) {
    selectedIds = defaults;
    console.log(`Selected ${selectedIds.length} stack-aware recommendations.`);
  } else {
    if (!process.stdin.isTTY) throw new Error("Interactive init needs a terminal; use --yes or add components explicitly");
    const prompt = readline.createInterface({ input, output });
    try {
      adapters = await chooseAdapters(prompt, adapters);
      defaultScope = flags.scope ?? await chooseScope(prompt, defaultScope);
      const filtered = listComponents().filter((component) => availableWithAdapters(component, adapters));
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
    adapters,
    components: [...byId.values()],
  });
  await applyDesired({ cwd, home, manifest, flags, writeManifest: true });
}

async function add({ cwd, home, flags, values }) {
  if (!values.length) throw new Error("Usage: harness-workshop add <component> [component...]");
  const existing = readManifest(cwd);
  const components = values.map((id) => requireComponent(id));
  const adapters = flags.adapters ?? [...(existing?.adapters ?? [])];
  if (flags.adapters === null) {
    for (const component of components) {
      for (const adapter of component.adapters ?? []) {
        if (!adapters.includes(adapter)) adapters.push(adapter);
      }
    }
  }
  const byId = new Map((existing?.components ?? []).map((selection) => [selection.id, selection]));
  for (const component of components) {
    const { id } = component;
    byId.set(id, {
      id,
      scope: flags.scope ?? byId.get(id)?.scope ?? componentScope(component, "project"),
    });
  }
  const manifest = normalizeManifest({
    ...(existing ?? emptyManifest()),
    adapters,
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

function list(adapters) {
  const components = listComponents().filter((component) => adapters === null
    || availableWithAdapters(component, adapters));
  for (const component of components) {
    const availability = isPortable(component) ? "portable" : component.adapters.join(",");
    console.log(`${component.id.padEnd(28)} ${availability.padEnd(13)} ${component.description}`);
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

async function chooseAdapters(prompt, defaults) {
  const fallback = defaults.length ? defaults.join(",") : "none";
  const answer = await prompt.question(`Optional adapters: none or ${supportedAdapters.join(",")} [${fallback}]: `);
  if (!answer.trim()) return defaults;
  return parseAdapters(answer);
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
    adapters: null,
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
    else if (value === "--scope" || value === "--adapter" || value === "--adapters"
      || value === "--target" || value === "--targets") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) throw new Error(`${value} requires a value`);
      index += 1;
      setValueFlag(flags, value, next);
    } else if (value.startsWith("--scope=")) setValueFlag(flags, "--scope", value.slice(8));
    else if (value.startsWith("--adapter=")) setValueFlag(flags, "--adapter", value.slice(10));
    else if (value.startsWith("--adapters=")) setValueFlag(flags, "--adapters", value.slice(11));
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
  flags.adapters = name === "--target" || name === "--targets"
    ? parseLegacyTargets(value)
    : parseAdapters(value);
}

function parseAdapters(value) {
  if (value.trim() === "none") return [];
  const adapters = value.split(",").map((adapter) => adapter.trim()).filter(Boolean);
  if (!adapters.length || adapters.some((adapter) => !supportedAdapters.includes(adapter))) {
    throw new Error(`Invalid adapters: ${value}`);
  }
  return [...new Set(adapters)];
}

function parseLegacyTargets(value) {
  const targets = value.split(",").map((target) => target.trim()).filter(Boolean);
  if (!targets.length || targets.some((target) => !new Set(["claude", "codex"]).has(target))) {
    throw new Error(`Invalid legacy targets: ${value}`);
  }
  return targets.includes("claude") ? ["claude"] : [];
}

function printHelp() {
  console.log(`harness-workshop ${version}

Usage:
  harness-workshop init [--yes] [--adapter claude]
  harness-workshop add <component...> [--scope project|user] [--adapter claude]
  harness-workshop plan
  harness-workshop remove <component...>
  harness-workshop update
  harness-workshop doctor
  harness-workshop list [--adapter claude|none]

Options:
  -y, --yes       Use stack-aware defaults during init
  --dry-run       Print exact changes without writing
  --force         Replace drifted managed content
  --scope VALUE   Default project or user scope
  --adapter VALUE Optional vendor adapter: claude or none
  -h, --help      Show help
  --version       Show version

Portable content installs canonically for every agent. The Claude adapter adds
only Claude-specific bridges and integrations. Codex uses the canonical files.

External tool commands are printed for review and never executed.`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
