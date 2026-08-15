import path from "node:path";
import { ClaudeSettingsEditor, hookCommand } from "./adapters/claude.mjs";
import {
  bundledContent,
  getComponent,
  lockedRemotePackage,
  metadataIntegrity,
  requireComponent,
  resolveRemotePackage,
} from "./catalog.mjs";
import { integrity, normalizeText } from "./integrity.mjs";
import {
  managedPayload,
  removeClaudeBridge,
  removeManagedBlock,
  upsertClaudeBridge,
  upsertManagedBlock,
} from "./managed.mjs";
import { ConflictError, Planner } from "./planner.mjs";
import { portablePath, resolvePortablePath } from "./paths.mjs";

const bridgePayload = normalizeText("@AGENTS.md\n");
const bridgeIntegrity = integrity(bridgePayload);

export async function reconcile({
  cwd,
  home,
  manifest,
  previousLock,
  force = false,
  refreshRemote = false,
}) {
  const planner = new Planner({ cwd, home, force });
  const claude = new ClaudeSettingsEditor({ cwd, home });
  const nextLock = { lockfileVersion: 1, components: {}, bridges: {} };
  const desiredIds = new Set(manifest.components.map(({ id }) => id));

  for (const selection of manifest.components) {
    const component = requireComponent(selection.id);
    validateSelection(component, selection, manifest.adapters);
    const previous = previousLock.components[component.id];
    const entry = await installComponent({
      component,
      selection,
      adapters: component.adapters
        ? manifest.adapters.filter((adapter) => component.adapters.includes(adapter))
        : manifest.adapters,
      previous,
      planner,
      claude,
      cwd,
      home,
      force,
      refreshRemote,
    });
    removeStaleFiles(previous, entry, planner);
    nextLock.components[component.id] = entry;
  }

  for (const [id, previous] of Object.entries(previousLock.components)) {
    if (desiredIds.has(id)) continue;
    uninstallComponent({ id, previous, component: getComponent(id), planner, claude, cwd, home, force });
  }

  reconcileClaudeBridge({ manifest, previousLock, nextLock, planner, cwd, home, force });
  claude.flush(planner);
  return { planner, lock: nextLock };
}

async function installComponent(context) {
  const { component, selection, adapters, previous } = context;
  const entry = {
    kind: component.kind,
    version: component.version,
    source: lockSource(component),
    metadataIntegrity: metadataIntegrity(component),
    scope: selection.scope,
    adapters,
    files: [],
  };

  if (component.kind === "block") {
    const content = bundledContent(component);
    entry.integrity = integrity(content);
    installBlock(context, entry, content);
  } else if (component.kind === "skill") {
    const resolved = await resolveSkillPackage(context);
    if (resolved.source) entry.source = resolved.source;
    entry.integrity = skillPackageIntegrity(resolved.files);
    installSkill(context, entry, resolved.files);
  } else if (component.kind === "hook") {
    const content = bundledContent(component);
    entry.integrity = integrity(content);
    installHook(context, entry, content);
  } else if (component.kind === "plugin") {
    entry.integrity = entry.metadataIntegrity;
    installPlugin(context, entry);
  } else if (component.kind === "tool") {
    entry.integrity = entry.metadataIntegrity;
    entry.manual = component.manual;
    context.planner.note(`${component.id}: ${component.manual.install}`);
    if (component.manual.postInstall) {
      context.planner.note(`${component.id} after install: ${component.manual.postInstall}`);
    }
  }

  if (previous && previous.scope !== selection.scope && component.kind === "plugin") {
    context.claude.disablePluginAdapter(previous.adapter, previous.scope);
  }
  return entry;
}

function installBlock({ component, previous, planner, cwd, force }, entry, content) {
  const file = path.join(cwd, "AGENTS.md");
  const current = planner.state(file);
  if (!new Set(["missing", "file"]).has(current.kind)) {
    throw new ConflictError(`Cannot manage ${planner.label(file)}: it is a ${current.kind}`);
  }
  const document = current.kind === "file" ? current.content : "";
  const payload = managedPayload(document, component.id);
  if (payload) {
    const expected = previous?.integrity ?? entry.integrity;
    if (integrity(payload) !== expected && !force) {
      throw new ConflictError(`Managed block has local changes: ${component.id}`);
    }
  }
  planner.write(file, upsertManagedBlock(document, component, content), { allowExisting: true });
  const previousFile = findFile(previous, file, planner);
  entry.files.push(fileRecord(file, "block", planner, {
    id: component.id,
    integrity: entry.integrity,
    created: previousFile?.created ?? current.kind === "missing",
  }));
}

function installSkill({ component, selection, adapters, previous, planner, cwd, home }, entry, files) {
  const name = component.id.slice("skill/".length);
  const root = selection.scope === "user" ? home : cwd;
  const canonicalDirectory = path.join(root, ".agents", "skills", name);
  for (const skillFile of files) {
    const canonical = skillPath(canonicalDirectory, skillFile.path, component.id);
    const previousFile = findFile(previous, canonical, planner);
    const current = planner.state(canonical);
    const fileIntegrity = integrity(skillFile.content);
    planner.write(canonical, skillFile.content, {
      mode: skillFile.mode ?? 0o644,
      owned: Boolean(previousFile) || (current.kind === "file" && current.content === skillFile.content),
      expectedIntegrity: previousFile?.integrity,
    });
    entry.files.push(fileRecord(canonical, "file", planner, {
      integrity: fileIntegrity,
      created: previousFile?.created ?? current.kind === "missing",
      ...(skillFile.mode === 0o755 ? { executable: true } : {}),
    }));
  }

  if (!adapters.includes("claude")) return;
  const claudeSkill = path.join(root, ".claude", "skills", name);
  const previousBridge = findFile(previous, claudeSkill, planner);
  if (process.platform === "win32") {
    for (const skillFile of files) {
      const bridgeFile = skillPath(claudeSkill, skillFile.path, component.id);
      const previousCopy = findFile(previous, bridgeFile, planner);
      const copyState = planner.state(bridgeFile);
      planner.write(bridgeFile, skillFile.content, {
        mode: skillFile.mode ?? 0o644,
        owned: Boolean(previousCopy) || (copyState.kind === "file" && copyState.content === skillFile.content),
        expectedIntegrity: previousCopy?.integrity,
      });
      entry.files.push(fileRecord(bridgeFile, "file", planner, {
        integrity: integrity(skillFile.content),
        created: previousCopy?.created ?? copyState.kind === "missing",
        fallbackCopy: true,
        ...(skillFile.mode === 0o755 ? { executable: true } : {}),
      }));
    }
  } else {
    const target = path.relative(path.dirname(claudeSkill), canonicalDirectory);
    const bridgeState = planner.state(claudeSkill);
    planner.symlink(claudeSkill, target, {
      linkType: "dir",
      owned: Boolean(previousBridge) || (bridgeState.kind === "symlink" && bridgeState.target === target),
      expectedTarget: previousBridge?.target,
    });
    entry.files.push(fileRecord(claudeSkill, "symlink", planner, {
      target,
      created: previousBridge?.created ?? bridgeState.kind === "missing",
    }));
  }
}

function installHook({ component, selection, previous, planner, claude, cwd, home }, entry, content) {
  const root = selection.scope === "user" ? home : cwd;
  const file = path.join(root, ".claude", "hooks", "harness-workshop", "slim-cli.sh");
  const previousFile = findFile(previous, file, planner);
  const current = planner.state(file);
  planner.write(file, content, {
    mode: 0o755,
    owned: Boolean(previousFile) || (current.kind === "file" && current.content === content),
    expectedIntegrity: previousFile?.integrity,
  });
  const command = hookCommand(selection.scope, { cwd, home });
  if (previous && previous.scope !== selection.scope && previous.adapter?.claude?.command) {
    claude.disableHook(previous.scope, previous.adapter.claude.command);
  }
  claude.enableHook(selection.scope, command);
  entry.adapter = { claude: { command } };
  entry.files.push(fileRecord(file, "file", planner, {
    integrity: entry.integrity,
    created: previousFile?.created ?? current.kind === "missing",
    executable: true,
  }));
}

function installPlugin({ component, selection, claude }, entry) {
  claude.enablePlugin(component, selection.scope);
  entry.adapter = component.adapter;
}

async function resolveSkillPackage({ component, previous, planner, cwd, home, force, refreshRemote, selection }) {
  if (component.content.kind === "bundled") {
    return { files: [{ path: "SKILL.md", content: bundledContent(component), mode: 0o644 }] };
  }

  const name = component.id.slice("skill/".length);
  const root = selection.scope === "user" ? home : cwd;
  const canonicalDirectory = path.join(root, ".agents", "skills", name);
  if (!refreshRemote && previous) {
    const local = selection.scope === previous.scope
      ? localSkillPackage(previous, canonicalDirectory, planner, force)
      : null;
    if (local) return { files: local, source: previous.source };

    const resolved = await lockedRemotePackage(component, previous.source);
    if (!matchesPreviousSkillIntegrity(resolved.files, previous.integrity)) {
      throw new ConflictError(`Pinned remote content failed its checksum: ${component.id}`);
    }
    return resolved;
  }
  return resolveRemotePackage(component);
}

function uninstallComponent({ id, previous, component, planner, claude, cwd, home, force }) {
  if (previous.kind === "block") {
    uninstallBlock(id, previous, planner, cwd, force);
  } else {
    removeFiles(previous.files, planner);
  }

  if (previous.kind === "hook" && previous.adapter?.claude?.command) {
    claude.disableHook(previous.scope, previous.adapter.claude.command);
  } else if (previous.kind === "plugin") {
    if (previous.adapter) claude.disablePluginAdapter(previous.adapter, previous.scope);
    else if (component) claude.disablePlugin(component, previous.scope);
    else planner.note(`${id}: remove its Claude enabledPlugins entry manually; it is no longer in the catalog`);
  }
}

function uninstallBlock(id, previous, planner, cwd, force) {
  const file = path.join(cwd, "AGENTS.md");
  const current = planner.state(file);
  if (current.kind === "missing") return;
  if (current.kind !== "file") throw new ConflictError(`Managed file changed type: ${planner.label(file)}`);
  const payload = managedPayload(current.content, id);
  if (!payload) return;
  if (integrity(payload) !== previous.integrity && !force) {
    throw new ConflictError(`Managed block has local changes: ${id}`);
  }
  const result = removeManagedBlock(current.content, id);
  const record = previous.files?.find((candidate) => candidate.kind === "block");
  if (!result && record?.created) planner.delete(file, { owned: true });
  else planner.write(file, result, { allowExisting: true });
}

function removeStaleFiles(previous, next, planner) {
  if (!previous?.files) return;
  const desired = new Set(next.files.map(({ path: file }) => file));
  removeFiles(previous.files.filter((file) => file.kind !== "block" && !desired.has(file.path)), planner);
}

function removeFiles(files = [], planner) {
  for (const record of files) {
    if (record.kind === "block") continue;
    planner.delete(resolvePortablePath(record.path, planner), {
      owned: true,
      expectedIntegrity: record.integrity,
      expectedTarget: record.target,
    });
  }
}

function reconcileClaudeBridge({ manifest, previousLock, nextLock, planner, cwd, force }) {
  const needsBridge = manifest.adapters.includes("claude")
    && manifest.components.some(({ id }) => getComponent(id)?.kind === "block");
  const previous = previousLock.bridges?.claudeAgents;
  const file = path.join(cwd, "CLAUDE.md");

  if (!needsBridge) {
    if (previous?.managed === "symlink" && previous.owned) {
      planner.delete(file, { owned: true, expectedTarget: previous.target });
    } else if (previous?.managed === "block") {
      const current = planner.state(file);
      if (current.kind === "file") {
        const payload = managedPayload(current.content, "bridge/agents-md");
        if (payload && integrity(payload) !== bridgeIntegrity && !force) {
          throw new ConflictError("Claude AGENTS.md bridge has local changes");
        }
        const result = removeClaudeBridge(current.content);
        if (!result && previous.created) planner.delete(file, { owned: true });
        else planner.write(file, result, { allowExisting: true });
      }
    }
    return;
  }

  const current = planner.state(file);
  if (previous?.managed === "symlink" && current.kind !== "missing" && current.kind !== "symlink" && !force) {
    throw new ConflictError("Claude AGENTS.md bridge changed type");
  }
  if (previous?.managed === "block" && current.kind !== "missing" && current.kind !== "file" && !force) {
    throw new ConflictError("Claude AGENTS.md bridge changed type");
  }
  if (current.kind === "symlink" && current.target === "AGENTS.md") {
    nextLock.bridges.claudeAgents = {
      path: portablePath(file, planner),
      managed: "symlink",
      target: "AGENTS.md",
      owned: previous?.managed === "symlink" ? previous.owned : false,
    };
    return;
  }

  if (current.kind === "missing" && process.platform !== "win32") {
    planner.symlink(file, "AGENTS.md", { linkType: "file", owned: Boolean(previous?.owned) });
    nextLock.bridges.claudeAgents = {
      path: portablePath(file, planner),
      managed: "symlink",
      target: "AGENTS.md",
      owned: true,
    };
    return;
  }

  if (!new Set(["missing", "file"]).has(current.kind)) {
    if (!force) throw new ConflictError(`Cannot create Claude bridge at ${planner.label(file)}`);
    planner.symlink(file, "AGENTS.md", { linkType: "file", owned: true });
    nextLock.bridges.claudeAgents = {
      path: portablePath(file, planner),
      managed: "symlink",
      target: "AGENTS.md",
      owned: true,
    };
    return;
  }

  const document = current.kind === "file" ? current.content : "";
  const payload = managedPayload(document, "bridge/agents-md");
  if (payload && integrity(payload) !== bridgeIntegrity && !force) {
    throw new ConflictError("Claude AGENTS.md bridge has local changes");
  }
  planner.write(file, upsertClaudeBridge(document), { allowExisting: true });
  nextLock.bridges.claudeAgents = {
    path: portablePath(file, planner),
    managed: "block",
    integrity: bridgeIntegrity,
    created: previous?.created ?? current.kind === "missing",
    owned: true,
  };
}

function validateSelection(component, selection, adapters) {
  if (!component.scopes.includes(selection.scope)) {
    throw new Error(`${component.id} does not support ${selection.scope} scope`);
  }
  if (component.adapters
    && !adapters.some((adapter) => component.adapters.includes(adapter))) {
    throw new Error(`${component.id} requires one of these adapters: ${component.adapters.join(", ")}`);
  }
}

function lockSource(component) {
  if (component.content?.kind === "bundled") {
    return {
      kind: "bundled",
      path: component.content.path,
      ...(component.content.upstream ? { upstream: component.content.upstream } : {}),
      ...(component.content.revision ? { revision: component.content.revision } : {}),
    };
  }
  if (component.content?.kind === "remote") {
    return {
      kind: "remote",
      url: component.content.url,
      upstream: component.content.upstream,
      mutable: Boolean(component.content.mutable),
    };
  }
  if (component.kind === "plugin") return { kind: "adapter", adapter: "claude" };
  return { kind: "catalog" };
}

function fileRecord(file, kind, planner, properties = {}) {
  return { path: portablePath(file, planner), kind, ...properties };
}

function findFile(previous, file, planner) {
  const encoded = portablePath(file, planner);
  return previous?.files?.find((candidate) => candidate.path === encoded);
}

function localSkillPackage(previous, canonicalDirectory, planner, force) {
  const records = (previous.files ?? []).filter((record) => {
    if (record.kind !== "file" || record.fallbackCopy) return false;
    const absolute = resolvePortablePath(record.path, planner);
    const relative = path.relative(canonicalDirectory, absolute);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
  if (!records.length) return null;

  const files = [];
  for (const record of records) {
    const absolute = resolvePortablePath(record.path, planner);
    const current = planner.state(absolute);
    if (current.kind === "missing") return null;
    if (current.kind !== "file") {
      if (!force) throw new ConflictError(`Managed file changed type: ${planner.label(absolute)}`);
      return null;
    }
    if (record.integrity && integrity(current.content) !== record.integrity && !force) {
      throw new ConflictError(`Managed file has local changes: ${planner.label(absolute)}`);
    }
    files.push({
      path: path.relative(canonicalDirectory, absolute).split(path.sep).join("/"),
      content: normalizeText(current.content),
      mode: current.mode & 0o777,
    });
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function skillPackageIntegrity(files) {
  const records = files
    .map((file) => ({ path: file.path, integrity: integrity(file.content), mode: file.mode ?? 0o644 }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return integrity(JSON.stringify(records));
}

function matchesPreviousSkillIntegrity(files, expected) {
  if (skillPackageIntegrity(files) === expected) return true;
  return files.length === 1 && files[0].path === "SKILL.md" && integrity(files[0].content) === expected;
}

function skillPath(root, relative, componentId) {
  if (typeof relative !== "string" || !relative || relative.includes("\\")) {
    throw new Error(`Invalid skill package path: ${componentId}`);
  }
  const segments = relative.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid skill package path: ${componentId}/${relative}`);
  }
  const absolute = path.resolve(root, ...segments);
  if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error(`Skill package escapes its directory: ${componentId}/${relative}`);
  }
  return absolute;
}
