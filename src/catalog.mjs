import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { integrity, normalizeText, stableJson } from "./integrity.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogRoot = path.join(packageRoot, "catalog");
const catalogPath = path.join(catalogRoot, "catalog.json");

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
  return (await resolveRemoteContent(component)).content;
}

export async function resolveRemoteContent(component) {
  if (component.content?.kind !== "remote") {
    throw new Error(`${component.id} does not have remote content`);
  }
  let resolvedUrl = component.content.url;
  let revision = null;
  if (component.content.mutable) {
    const github = parseGitHubRawUrl(component.content.url);
    if (!github) throw new Error(`Mutable remote source is not pinnable: ${component.id}`);
    const response = await fetch(`https://api.github.com/repos/${github.owner}/${github.repository}/commits/${encodeURIComponent(github.ref)}`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "harness-workshop",
      },
    });
    if (!response.ok) throw new Error(`Failed to resolve ${component.id}: HTTP ${response.status}`);
    const payload = await response.json();
    if (!/^[0-9a-f]{40}$/i.test(payload.sha ?? "")) {
      throw new Error(`Failed to resolve an immutable revision for ${component.id}`);
    }
    revision = payload.sha;
    resolvedUrl = `https://raw.githubusercontent.com/${github.owner}/${github.repository}/${revision}/${github.file}`;
  }
  return {
    content: await fetchRemoteText(resolvedUrl, component.id),
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

export async function lockedRemoteContent(componentId, source) {
  if (!source?.resolvedUrl) throw new Error(`Lockfile does not pin ${componentId}; run update to repair it`);
  return fetchRemoteText(source.resolvedUrl, componentId);
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
