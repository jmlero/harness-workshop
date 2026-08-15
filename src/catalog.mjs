import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { integrity, normalizeText, stableJson } from "./integrity.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogRoot = path.join(packageRoot, "catalog");
const catalogPath = path.join(catalogRoot, "catalog.json");
const remotePackageMaxFiles = 200;
const remotePackageMaxBytes = 2_000_000;

let cachedCatalog;

export function loadCatalog() {
  if (cachedCatalog) return cachedCatalog;
  const parsed = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const ids = new Set();

  for (const component of parsed.components ?? []) {
    if (!component.id || ids.has(component.id)) {
      throw new Error(`Invalid or duplicate catalog component: ${component.id ?? "<missing>"}`);
    }
    if (!component.id.startsWith(`${component.kind}/`)) {
      throw new Error(`Catalog kind and ID disagree: ${component.id}`);
    }
    if (Object.hasOwn(component, "targets")) {
      throw new Error(`Catalog component uses legacy target metadata: ${component.id}`);
    }
    if (component.adapters && (!Array.isArray(component.adapters)
      || !component.adapters.length
      || component.adapters.some((adapter) => adapter !== "claude"))) {
      throw new Error(`Invalid adapters for catalog component: ${component.id}`);
    }
    if (new Set(["hook", "plugin"]).has(component.kind) && !component.adapters) {
      throw new Error(`Adapter-specific component must declare adapters: ${component.id}`);
    }
    if (component.kind === "skill" && !Number.isInteger(component.context?.estimatedTokens)) {
      throw new Error(`Skill must declare an estimated context cost: ${component.id}`);
    }
    if (component.content?.kind === "remote" && component.content.root) {
      const github = parseGitHubRawUrl(component.content.url);
      const root = normalizeRemotePath(component.content.root, `${component.id} root`);
      if (!github || github.file !== `${root}/SKILL.md`) {
        throw new Error(`Remote skill URL must point to its declared root SKILL.md: ${component.id}`);
      }
      if (component.content.overlay) readCatalogText(component.content.overlay, component.id);
    }
    ids.add(component.id);
  }

  cachedCatalog = parsed;
  return parsed;
}

export function listComponents() {
  return loadCatalog().components;
}

export function isPortable(component) {
  return !component.adapters?.length;
}

export function availableWithAdapters(component, adapters) {
  return isPortable(component)
    || component.adapters.some((adapter) => adapters.includes(adapter));
}

export function getComponent(id) {
  return listComponents().find((component) => component.id === id);
}

export function requireComponent(id) {
  const component = getComponent(id);
  if (!component) {
    const matches = listComponents()
      .map((candidate) => candidate.id)
      .filter((candidate) => candidate.includes(id));
    const hint = matches.length ? ` Did you mean: ${matches.join(", ")}?` : "";
    throw new Error(`Unknown component: ${id}.${hint}`);
  }
  return component;
}

export function bundledContent(component) {
  if (component.content?.kind !== "bundled") {
    throw new Error(`${component.id} does not have bundled content`);
  }
  const sourcePath = path.resolve(catalogRoot, component.content.path);
  const allowedRoots = [catalogRoot, path.join(packageRoot, "adapters")];
  if (!allowedRoots.some((root) => sourcePath === root || sourcePath.startsWith(`${root}${path.sep}`))) {
    throw new Error(`Bundled content escapes the package: ${component.id}`);
  }
  return normalizeText(fs.readFileSync(sourcePath, "utf8"));
}

export async function remoteContent(component) {
  return skillFile(await resolveRemotePackage(component), component.id).content;
}

export async function resolveRemoteContent(component) {
  const resolved = await resolveRemotePackage(component);
  return {
    ...resolved,
    content: skillFile(resolved, component.id).content,
  };
}

export async function resolveRemotePackage(component) {
  if (component.content?.kind !== "remote") {
    throw new Error(`${component.id} does not have remote content`);
  }
  const github = parseGitHubRawUrl(component.content.url);
  let resolvedUrl = component.content.url;
  let revision = null;
  let treeSha = null;
  if (component.content.mutable) {
    if (!github) throw new Error(`Mutable remote source is not pinnable: ${component.id}`);
    const payload = await fetchGitHubJson(
      `https://api.github.com/repos/${github.owner}/${github.repository}/commits/${encodeURIComponent(github.ref)}`,
      component.id,
    );
    if (!/^[0-9a-f]{40}$/i.test(payload.sha ?? "")) {
      throw new Error(`Failed to resolve an immutable revision for ${component.id}`);
    }
    revision = payload.sha;
    treeSha = payload.commit?.tree?.sha ?? revision;
    resolvedUrl = `https://raw.githubusercontent.com/${github.owner}/${github.repository}/${revision}/${github.file}`;
  }

  if (!component.content.root) {
    const content = await fetchRemoteText(resolvedUrl, component.id);
    return {
      files: [{ path: "SKILL.md", content, mode: 0o644 }],
      source: {
        kind: "remote",
        url: component.content.url,
        resolvedUrl,
        revision,
        upstream: component.content.upstream,
        mutable: Boolean(component.content.mutable),
      },
    };
  }

  if (!github) throw new Error(`Remote directory source is not a GitHub raw URL: ${component.id}`);
  const root = normalizeRemotePath(component.content.root, `${component.id} root`);
  const pinnedRevision = revision ?? github.ref;
  const tree = await fetchGitHubJson(
    `https://api.github.com/repos/${github.owner}/${github.repository}/git/trees/${encodeURIComponent(treeSha ?? pinnedRevision)}?recursive=1`,
    component.id,
  );
  if (tree.truncated) throw new Error(`Remote tree is truncated: ${component.id}`);

  const descriptors = (tree.tree ?? [])
    .filter((entry) => entry.type === "blob" && entry.path.startsWith(`${root}/`))
    .map((entry) => ({
      path: normalizePackagePath(entry.path.slice(root.length + 1), component.id),
      resolvedUrl: `https://raw.githubusercontent.com/${github.owner}/${github.repository}/${pinnedRevision}/${entry.path}`,
      mode: entry.mode === "100755" ? 0o755 : 0o644,
      size: entry.size ?? 0,
    }));

  if (component.content.licensePath) {
    const licensePath = normalizeRemotePath(component.content.licensePath, `${component.id} license path`);
    const treeEntry = (tree.tree ?? []).find((entry) => entry.type === "blob" && entry.path === licensePath);
    if (!treeEntry) throw new Error(`Remote license file not found: ${component.id}`);
    descriptors.push({
      path: normalizePackagePath(component.content.licenseTarget ?? "LICENSE", component.id),
      resolvedUrl: `https://raw.githubusercontent.com/${github.owner}/${github.repository}/${pinnedRevision}/${licensePath}`,
      mode: 0o644,
      size: treeEntry.size ?? 0,
    });
  }

  descriptors.sort((left, right) => left.path.localeCompare(right.path));
  validateRemoteDescriptors(descriptors, component.id);
  const rawFiles = await fetchResolvedFiles(descriptors, component.id);
  const files = applyRemoteOverlay(component, rawFiles);
  skillFile({ files }, component.id);
  return {
    files,
    source: {
      kind: "remote",
      url: component.content.url,
      resolvedUrl,
      revision,
      root,
      upstream: component.content.upstream,
      mutable: Boolean(component.content.mutable),
      resolvedFiles: descriptors.map((descriptor, index) => ({
        path: descriptor.path,
        resolvedUrl: descriptor.resolvedUrl,
        mode: descriptor.mode,
        integrity: integrity(rawFiles[index].content),
      })),
    },
  };
}

export async function lockedRemoteContent(componentOrId, source) {
  const resolved = await lockedRemotePackage(componentOrId, source);
  const componentId = typeof componentOrId === "string" ? componentOrId : componentOrId.id;
  return skillFile(resolved, componentId).content;
}

export async function lockedRemotePackage(componentOrId, source) {
  const component = typeof componentOrId === "string" ? getComponent(componentOrId) : componentOrId;
  const componentId = component?.id ?? componentOrId;
  if (source?.resolvedFiles?.length) {
    validateRemoteDescriptors(source.resolvedFiles, componentId);
    const files = await fetchResolvedFiles(source.resolvedFiles, componentId, { verify: true });
    return { files: component ? applyRemoteOverlay(component, files) : files, source };
  }
  if (!source?.resolvedUrl) throw new Error(`Lockfile does not pin ${componentId}; run update to repair it`);
  const content = await fetchRemoteText(source.resolvedUrl, componentId);
  const files = [{ path: "SKILL.md", content, mode: 0o644 }];
  return { files: component ? applyRemoteOverlay(component, files) : files, source };
}

async function fetchRemoteText(url, componentId) {
  const response = await fetch(url, {
    headers: { "user-agent": "harness-workshop" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${componentId}: HTTP ${response.status}`);
  }
  return normalizeText(await response.text());
}

async function fetchGitHubJson(url, componentId) {
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "harness-workshop",
    },
  });
  if (!response.ok) throw new Error(`Failed to resolve ${componentId}: HTTP ${response.status}`);
  return response.json();
}

async function fetchResolvedFiles(descriptors, componentId, { verify = false } = {}) {
  const files = await Promise.all(descriptors.map(async (descriptor) => {
    const content = await fetchRemoteText(descriptor.resolvedUrl, `${componentId}/${descriptor.path}`);
    if (verify && descriptor.integrity && integrity(content) !== descriptor.integrity) {
      throw new Error(`Pinned remote file failed its checksum: ${componentId}/${descriptor.path}`);
    }
    return { path: descriptor.path, content, mode: descriptor.mode ?? 0o644 };
  }));
  const totalBytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0);
  if (totalBytes > remotePackageMaxBytes) throw new Error(`Remote package is too large: ${componentId}`);
  return files;
}

function validateRemoteDescriptors(descriptors, componentId) {
  if (!descriptors.length || descriptors.length > remotePackageMaxFiles) {
    throw new Error(`Remote package has an invalid file count: ${componentId}`);
  }
  const paths = new Set();
  let declaredBytes = 0;
  for (const descriptor of descriptors) {
    const relative = normalizePackagePath(descriptor.path, componentId);
    if (paths.has(relative)) throw new Error(`Remote package has a duplicate path: ${componentId}/${relative}`);
    paths.add(relative);
    declaredBytes += descriptor.size ?? 0;
  }
  if (!paths.has("SKILL.md")) throw new Error(`Remote package has no SKILL.md: ${componentId}`);
  if (declaredBytes > remotePackageMaxBytes) throw new Error(`Remote package is too large: ${componentId}`);
}

function applyRemoteOverlay(component, files) {
  if (!component.content?.overlay) return files;
  const overlay = readCatalogText(component.content.overlay, component.id).trim();
  return files.map((file) => file.path === "SKILL.md"
    ? { ...file, content: insertSkillOverlay(file.content, overlay, component.id) }
    : file);
}

function insertSkillOverlay(content, overlay, componentId) {
  const frontmatter = /^---\n[\s\S]*?\n---\n/.exec(content);
  if (!frontmatter) throw new Error(`Remote skill has invalid frontmatter: ${componentId}`);
  const body = content.slice(frontmatter[0].length).replace(/^\n+/, "");
  return `${frontmatter[0]}\n${overlay}\n\n${body}`;
}

function skillFile(remotePackage, componentId) {
  const file = remotePackage.files.find((candidate) => candidate.path === "SKILL.md");
  if (!file) throw new Error(`Remote package has no SKILL.md: ${componentId}`);
  return file;
}

function readCatalogText(relative, componentId) {
  const sourcePath = path.resolve(catalogRoot, relative);
  if (sourcePath !== catalogRoot && !sourcePath.startsWith(`${catalogRoot}${path.sep}`)) {
    throw new Error(`Catalog content escapes the package: ${componentId}`);
  }
  return normalizeText(fs.readFileSync(sourcePath, "utf8"));
}

function normalizeRemotePath(value, label) {
  if (typeof value !== "string" || !value || value.includes("\\")) throw new Error(`Invalid ${label}`);
  const normalized = path.posix.normalize(value).replace(/^\.\//, "").replace(/\/$/, "");
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error(`Invalid ${label}`);
  }
  return normalized;
}

function normalizePackagePath(value, componentId) {
  const normalized = normalizeRemotePath(value, `${componentId} package path`);
  if (normalized !== value) throw new Error(`Remote package path is not normalized: ${componentId}/${value}`);
  return normalized;
}

function parseGitHubRawUrl(url) {
  const match = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/.exec(url);
  if (!match) return null;
  return { owner: match[1], repository: match[2], ref: match[3], file: match[4] };
}

export function metadataIntegrity(component) {
  return integrity(stableJson(component));
}

export function suggested(component, detected) {
  const when = component.suggest?.when;
  if (when === "always") return { pick: true, reason: component.suggest.reason };
  if (Array.isArray(when)) {
    return {
      pick: when.some((signal) => Boolean(detected[signal])),
      reason: component.suggest.reason,
    };
  }
  return { pick: false };
}

export { catalogPath, catalogRoot, packageRoot };
