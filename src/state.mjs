import fs from "node:fs";
import path from "node:path";

export const stateDirectoryName = ".harness-workshop";
export const manifestFileName = "manifest.json";
export const lockFileName = "lock.json";

export function statePaths(cwd) {
  const directory = path.join(cwd, stateDirectoryName);
  return {
    directory,
    manifest: path.join(directory, manifestFileName),
    lock: path.join(directory, lockFileName),
  };
}

export function emptyManifest(targets = ["claude", "codex"]) {
  return { manifestVersion: 1, targets, components: [] };
}

export function emptyLock() {
  return { lockfileVersion: 1, components: {}, bridges: {} };
}

export function readManifest(cwd, { required = false } = {}) {
  const file = statePaths(cwd).manifest;
  if (!fs.existsSync(file)) {
    if (required) throw new Error(`No manifest found. Run \`harness-workshop init\` first.`);
    return null;
  }
  return validateManifest(readJson(file));
}

export function readLock(cwd) {
  const file = statePaths(cwd).lock;
  if (!fs.existsSync(file)) return emptyLock();
  const lock = readJson(file);
  if (lock.lockfileVersion !== 1 || !lock.components) {
    throw new Error(`Unsupported lockfile: ${file}`);
  }
  lock.bridges ??= {};
  return lock;
}

export function validateManifest(manifest) {
  if (manifest.manifestVersion !== 1) throw new Error("Unsupported manifest version");
  if (!Array.isArray(manifest.targets) || !manifest.targets.length) {
    throw new Error("Manifest must select at least one target");
  }
  for (const target of manifest.targets) {
    if (!new Set(["claude", "codex"]).has(target)) {
      throw new Error(`Unsupported target in manifest: ${target}`);
    }
  }
  if (!Array.isArray(manifest.components)) throw new Error("Manifest components must be an array");
  const ids = new Set();
  for (const component of manifest.components) {
    if (!component?.id || ids.has(component.id)) {
      throw new Error(`Invalid or duplicate manifest component: ${component?.id ?? "<missing>"}`);
    }
    if (!new Set(["project", "user"]).has(component.scope)) {
      throw new Error(`Invalid scope for ${component.id}: ${component.scope}`);
    }
    ids.add(component.id);
  }
  return normalizeManifest(manifest);
}

export function normalizeManifest(manifest) {
  return {
    manifestVersion: 1,
    targets: [...new Set(manifest.targets)].sort(),
    components: [...manifest.components]
      .map(({ id, scope }) => ({ id, scope }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function jsonDocument(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse ${file}: ${error.message}`);
  }
}
