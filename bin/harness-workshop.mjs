#!/usr/bin/env node
import os from "node:os";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  availableWithAdapters,
  getComponent,
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
import {
  formatApplySummary,
  formatBanner,
  formatBlockCost,
  formatCatalog,
  formatDryRunFooter,
  formatHealthy,
  formatListHeader,
  formatProgress,
  formatProjectScan,
  formatSelection,
  orderedComponents,
  sectionKind,
} from "../src/ui.mjs";

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
      list({ cwd, ...parsed });
      break;
    default:
      throw new Error(`Unknown command: ${parsed.command}`);
  }
}

async function initialize({ cwd, home, flags }) {
  const existing = readManifest(cwd);
  const detected = detectStack(cwd);
  const stack = humanSummary(detected);
  maybeBanner("Find the minimum durable guidance this repository needs.");

  let adapters = flags.adapters ?? existing?.adapters ?? [];
  let defaultScope = flags.scope ?? "project";
  let selectedIds = [];

  const catalog = listComponents();
  const installedIds = new Set(existing?.components.map(({ id }) => id) ?? []);
  const blocks = catalog.filter((component) => component.kind === "block" && !installedIds.has(component.id));
  const recommendedBlocks = blocks.filter((component) => suggested(component, detected).pick);
  console.log(formatProjectScan({
    cwd,
    stack,
    catalogSize: catalog.length,
    suggestedCount: recommendedBlocks.length,
    installedCount: installedIds.size,
  }));

  if (flags.yes) {
    console.log(`${formatProgress("Assessment complete")} · no components installed automatically`);
    console.log("Repository left unchanged.");
    return;
  } else {
    if (!process.stdin.isTTY && !flags.interactive) {
      throw new Error("Interactive init needs a terminal; use --yes, --interactive, or add components explicitly");
    }
    const prompt = readline.createInterface({ input, output });
    try {
      if (blocks.length) {
        selectedIds = await chooseComponents(prompt, blocks, detected, installedIds, []);
        if (selectedIds.length) {
          const selectedBlocks = selectedIds.map((id) => requireComponent(id));
          console.log("");
          console.log(formatSelection(selectedBlocks));
          if (selectedIds.length === blocks.length && blocks.length > 1) {
            const accepted = await askYesNo(
              prompt,
              `Install all available blocks (${formatBlockCost(selectedBlocks)})?`,
              false,
            );
            if (!accepted) selectedIds = [];
          }
        }
      } else {
        console.log(`${formatProgress("Instruction blocks")} · all available blocks are already installed`);
      }

      if (flags.adapters?.length !== 0
        && await askYesNo(prompt, "Configure optional agent integrations?", false)) {
        const result = await chooseIntegrations({
          prompt,
          catalog,
          detected,
          installedIds,
          adapters,
          explicitAdapters: flags.adapters,
        });
        adapters = result.adapters;
        selectedIds.push(...result.selectedIds);
      }
      if (selectedIds.length) defaultScope = flags.scope ?? await chooseScope(prompt, defaultScope);
    } finally {
      prompt.close();
    }
  }

  if (!selectedIds.length) {
    console.log("No components selected. Repository left unchanged.");
    return;
  }

  const selectedComponents = selectedIds.map((id) => requireComponent(id));
  adapters = enableRequiredAdapters(adapters, selectedComponents, flags.adapters);

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
  await applyDesired({
    cwd,
    home,
    manifest,
    flags,
    writeManifest: true,
    displayComponents: selectedComponents,
    action: "Workshop ready",
  });
}

async function add({ cwd, home, flags, values }) {
  const existing = readManifest(cwd);
  const detected = detectStack(cwd);
  let selectedIds = values;
  let interactiveDefaultScope = null;
  maybeBanner("Add one explicit capability to the workshop.");

  if (!selectedIds.length) {
    if (!process.stdin.isTTY && !flags.interactive) {
      throw new Error("Usage: harness-workshop add <component> [component...] or add --interactive");
    }
    const adapters = flags.adapters ?? existing?.adapters ?? [];
    const installedIds = new Set(existing?.components.map(({ id }) => id) ?? []);
    const candidates = (flags.adapters === null
      ? listComponents()
      : listComponents().filter((component) => availableWithAdapters(component, adapters)))
      .filter((component) => !installedIds.has(component.id));
    if (!candidates.length) {
      console.log("Everything in this catalog is already installed.");
      return;
    }
    const prompt = readline.createInterface({ input, output });
    try {
      selectedIds = await chooseComponents(prompt, candidates, detected, installedIds, []);
      if (selectedIds.length && !flags.scope) interactiveDefaultScope = await chooseScope(prompt, "project");
    } finally {
      prompt.close();
    }
    if (!selectedIds.length) {
      console.log("No components selected.");
      return;
    }
  }

  const components = selectedIds.map((id) => requireComponent(id));
  const adapters = enableRequiredAdapters(flags.adapters ?? [...(existing?.adapters ?? [])], components, flags.adapters);
  const byId = new Map((existing?.components ?? []).map((selection) => [selection.id, selection]));
  for (const component of components) {
    const { id } = component;
    byId.set(id, {
      id,
      scope: flags.scope ?? byId.get(id)?.scope ?? componentScope(component, interactiveDefaultScope ?? "project"),
    });
  }
  const manifest = normalizeManifest({
    ...(existing ?? emptyManifest()),
    adapters,
    components: [...byId.values()],
  });
  await applyDesired({
    cwd,
    home,
    manifest,
    flags,
    writeManifest: true,
    displayComponents: components,
    action: "Components added",
  });
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
  await applyDesired({
    cwd,
    home,
    manifest,
    flags,
    writeManifest: true,
    displayComponents: values.map((id) => getComponent(id)).filter(Boolean),
    action: "Components removed",
  });
}

async function plan({ cwd, home, flags }) {
  const manifest = readManifest(cwd, { required: true });
  const previousLock = readLock(cwd);
  const result = await reconcile({ cwd, home, manifest, previousLock, force: flags.force });
  const paths = statePaths(cwd);
  result.planner.write(paths.lock, jsonDocument(result.lock), { allowExisting: true });
  const components = manifest.components.map(({ id }) => requireComponent(id));
  if (components.some(({ kind }) => kind === "block")) {
    console.log(formatSelection(components));
    console.log("");
  }
  console.log(formatPlan(result.planner));
}

async function update({ cwd, home, flags }) {
  const manifest = readManifest(cwd, { required: true });
  await applyDesired({
    cwd,
    home,
    manifest,
    flags,
    writeManifest: false,
    refreshRemote: true,
    displayComponents: manifest.components.map(({ id }) => requireComponent(id)),
    action: "Workshop updated",
  });
}

async function doctor({ cwd, home, flags }) {
  const manifest = readManifest(cwd, { required: true });
  const previousLock = readLock(cwd);
  const result = await reconcile({ cwd, home, manifest, previousLock, force: false });
  const lockMatches = jsonDocument(previousLock) === jsonDocument(result.lock);
  if (!result.planner.hasChanges() && lockMatches) {
    console.log(formatHealthy(manifest.components.length, result.planner.notes.length > 0));
    return;
  }

  console.error("Drift or an available catalog update was detected:");
  console.error(formatPlan(result.planner));
  if (!lockMatches) console.error("Lockfile metadata differs from the catalog or manifest.");
  process.exitCode = 1;
}

function list({ cwd, flags, values }) {
  if (values.length > 1) throw new Error("Usage: harness-workshop list [section]");
  const filter = sectionKind(values[0]);
  const manifest = readManifest(cwd);
  const installedIds = new Set(manifest?.components.map(({ id }) => id) ?? []);
  const detected = detectStack(cwd);
  let components = listComponents().filter((component) => flags.adapters === null
    || availableWithAdapters(component, flags.adapters));
  if (filter) components = components.filter(({ kind }) => kind === filter);
  maybeBanner("Browse the curated component catalog.");
  console.log(formatListHeader(components.length, components.filter(({ id }) => installedIds.has(id)).length, filter));
  console.log("");
  console.log(formatCatalog(components, { detected, installedIds, suggest: suggested }));
}

async function applyDesired({
  cwd,
  home,
  manifest,
  flags,
  writeManifest,
  refreshRemote = false,
  displayComponents = [],
  action = "Applied",
}) {
  if (output.isTTY) console.log(formatProgress("Building a safe, reversible change set…"));
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

  if (flags.dryRun) {
    const components = manifest.components.map(({ id }) => requireComponent(id));
    if (components.some(({ kind }) => kind === "block")) {
      console.log(formatSelection(components));
      console.log("");
    }
    console.log(formatPlan(result.planner));
    console.log("");
    console.log(formatDryRunFooter());
    return;
  }
  result.planner.apply();
  console.log(formatApplySummary(result.planner, { components: displayComponents, action }));
}

function componentScope(component, requested) {
  if (component.recommendedScope && component.scopes.includes(component.recommendedScope)) {
    return component.recommendedScope;
  }
  if (component.scopes.includes(requested)) return requested;
  return component.scopes[0];
}

async function chooseScope(prompt, fallback) {
  const answer = await prompt.question(`Default scope: project or user [${fallback}]: `);
  const scope = answer.trim() || fallback;
  if (!new Set(["project", "user"]).has(scope)) throw new Error(`Invalid scope: ${scope}`);
  return scope;
}

async function askYesNo(prompt, question, fallback) {
  const hint = fallback ? "Y/n" : "y/N";
  const answer = (await prompt.question(`${question} [${hint}]: `)).trim().toLowerCase();
  if (!answer) return fallback;
  if (new Set(["y", "yes"]).has(answer)) return true;
  if (new Set(["n", "no"]).has(answer)) return false;
  throw new Error(`Expected yes or no: ${answer}`);
}

async function chooseIntegrations({
  prompt,
  catalog,
  detected,
  installedIds,
  adapters,
  explicitAdapters,
}) {
  const supported = [...new Set(catalog
    .filter(({ kind }) => kind === "plugin")
    .flatMap((component) => component.adapters ?? []))];
  const availableAdapters = explicitAdapters === null
    ? supported
    : supported.filter((adapter) => explicitAdapters.includes(adapter));
  if (!availableAdapters.length) {
    console.log(`${formatProgress("Agent integrations")} · none available for the selected adapters`);
    return { adapters, selectedIds: [] };
  }
  const fallback = availableAdapters.find((adapter) => adapters.includes(adapter)) ?? availableAdapters[0];
  const answer = (await prompt.question(`Agent for integrations (${availableAdapters.join("/")}) [${fallback}]: `)).trim();
  const adapter = answer || fallback;
  if (!availableAdapters.includes(adapter)) throw new Error(`Unsupported integration agent: ${adapter}`);
  const selectedAdapters = [...new Set([...adapters, adapter])];

  const candidates = catalog.filter((component) => component.kind === "plugin"
    && !installedIds.has(component.id)
    && availableWithAdapters(component, [adapter]));
  if (!candidates.length) {
    console.log(`${formatProgress("Agent integrations")} · none available for ${selectedAdapters.join(", ")}`);
    return { adapters: selectedAdapters, selectedIds: [] };
  }
  const selectedIds = await chooseComponents(prompt, candidates, detected, installedIds, []);
  return {
    adapters: selectedIds.length ? selectedAdapters : adapters,
    selectedIds,
  };
}

async function chooseComponents(prompt, components, detected, installedIds = new Set(), defaultIds = null) {
  const ordered = orderedComponents(components);
  const configuredDefaults = defaultIds === null
    ? new Set(ordered.filter((component) => suggested(component, detected).pick).map(({ id }) => id))
    : new Set(defaultIds);
  const defaults = ordered
    .map((component, index) => configuredDefaults.has(component.id) && !installedIds.has(component.id) ? index + 1 : null)
    .filter(Boolean);
  console.log("");
  console.log(formatCatalog(ordered, {
    detected,
    installedIds,
    numbered: true,
    suggest: suggested,
  }));
  console.log("");
  const fallback = defaults.length ? defaults.join(",") : "none";
  const answer = await prompt.question(`Select numbers or ranges; use "none" to skip [${fallback}]: `);
  const indexes = parseComponentSelection(answer, defaults, ordered.length);
  return indexes.map((index) => ordered[index - 1].id);
}

function parseComponentSelection(answer, defaults, maximum) {
  const value = answer.trim().toLowerCase();
  if (!value) return defaults;
  if (value === "none") return [];
  if (value === "all") return Array.from({ length: maximum }, (_, index) => index + 1);

  const indexes = [];
  for (const token of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    const range = /^(\d+)-(\d+)$/.exec(token);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end) throw new Error(`Invalid descending range: ${token}`);
      for (let index = start; index <= end; index += 1) indexes.push(index);
    } else {
      indexes.push(Number(token));
    }
  }
  if (!indexes.length || indexes.some((index) => !Number.isInteger(index) || index < 1 || index > maximum)) {
    throw new Error("Invalid component selection");
  }
  return [...new Set(indexes)];
}

function enableRequiredAdapters(adapters, components, explicitAdapters) {
  const enabled = [...adapters];
  if (explicitAdapters !== null) return enabled;
  for (const component of components) {
    if (component.adapters?.length
      && !component.adapters.some((adapter) => enabled.includes(adapter))) {
      enabled.push(component.adapters[0]);
    }
  }
  return enabled;
}

function maybeBanner(subtitle) {
  if (output.isTTY) console.log(formatBanner(subtitle));
}

function parseArguments(argv) {
  const flags = {
    dryRun: false,
    force: false,
    help: false,
    interactive: false,
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
    else if (value === "--interactive") flags.interactive = true;
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
  harness-workshop init [--interactive|--yes] [--adapter claude|grok]
  harness-workshop list [blocks|skills|commands|integrations]
  harness-workshop add [component...] [--scope project|user] [--adapter claude|grok]
  harness-workshop plan
  harness-workshop remove <component...>
  harness-workshop update
  harness-workshop doctor

Options:
  -y, --yes       For init, assess without changing project or user files
  --interactive   Prompt even when standard input is piped
  --dry-run       Print exact changes without writing
  --force         Replace drifted managed content
  --scope VALUE   Default project or user scope
  --adapter VALUE Optional vendor adapter: claude, grok, or none
  -h, --help      Show help
  --version       Show version

Portable content installs canonically for every agent. Codex and Grok read the
canonical files directly; adapters add only vendor-specific edges.

Start with list blocks and add explicit block IDs. init may validly select
none; skills, commands, and integrations are secondary opt-in capabilities.

Component sections:
  blocks        Always-on text managed inside AGENTS.md
  skills        On-demand knowledge and workflows
  commands      Explicit Agent Skills invoked as $name in Codex or /name in Grok
  integrations  Vendor-native plugins and language servers
`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
