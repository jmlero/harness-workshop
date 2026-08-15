import { integrity, normalizeText } from "./integrity.mjs";

export class ManagedContentError extends Error {}

export function upsertManagedBlock(document, component, content) {
  const normalized = normalizeText(content);
  const digest = integrity(normalized);
  const range = findManagedRange(document, component.id);
  const segment = managedSegment(component.id, component.version, digest, normalized);

  if (range) return `${document.slice(0, range.start)}${segment}${document.slice(range.end)}`;
  if (!document) return `${segment}\n`;
  const separator = document.endsWith("\n\n") ? "" : document.endsWith("\n") ? "\n" : "\n\n";
  return `${document}${separator}${segment}\n`;
}

export function removeManagedBlock(document, id) {
  const range = findManagedRange(document, id);
  if (!range) return document;
  const result = `${document.slice(0, range.start)}${document.slice(range.end)}`;
  return result.trim() ? result : "";
}

export function managedPayload(document, id) {
  const range = findManagedRange(document, id);
  if (!range) return null;
  const segment = document.slice(range.start, range.end);
  const firstNewline = segment.indexOf("\n");
  const lastNewline = segment.lastIndexOf("\n");
  if (firstNewline === -1 || lastNewline <= firstNewline) {
    throw new ManagedContentError(`Malformed managed block: ${id}`);
  }
  const body = segment.slice(firstNewline + 1, lastNewline);
  const metadataEnd = body.indexOf("\n");
  if (metadataEnd === -1 || !body.startsWith("<!-- harness-workshop:source ")) {
    throw new ManagedContentError(`Missing managed metadata: ${id}`);
  }
  return normalizeText(body.slice(metadataEnd + 1));
}

export function upsertClaudeBridge(document) {
  const bridge = {
    id: "bridge/agents-md",
    version: "1",
  };
  return upsertManagedBlock(document, bridge, "@AGENTS.md\n");
}

export function removeClaudeBridge(document) {
  return removeManagedBlock(document, "bridge/agents-md");
}

export function findManagedRange(document, id) {
  const startMarker = `<!-- harness-workshop:start ${id} -->`;
  const endMarker = `<!-- harness-workshop:end ${id} -->`;
  const starts = occurrences(document, startMarker);
  const ends = occurrences(document, endMarker);
  if (!starts.length && !ends.length) return null;
  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) {
    throw new ManagedContentError(`Ambiguous managed boundaries for ${id}`);
  }
  return { start: starts[0], end: ends[0] + endMarker.length };
}

function managedSegment(id, version, digest, content) {
  return [
    `<!-- harness-workshop:start ${id} -->`,
    `<!-- harness-workshop:source ${id}@${version} integrity ${digest} -->`,
    content.trimEnd(),
    `<!-- harness-workshop:end ${id} -->`,
  ].join("\n");
}

function occurrences(document, needle) {
  const result = [];
  let from = 0;
  while (true) {
    const index = document.indexOf(needle, from);
    if (index === -1) return result;
    result.push(index);
    from = index + needle.length;
  }
}
