import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  bundledContent,
  listComponents,
  lockedRemoteContent,
  remoteContent,
} from "../src/catalog.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("catalog contains every ported component with stable metadata", () => {
  const components = listComponents();
  const ids = components.map(({ id }) => id);
  assert.equal(components.length, 18);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    "block/tdd",
    "skill/audit-code",
    "skill/audit-docs",
    "skill/review-pr",
    "hook/slim-cli",
    "plugin/frontend-design",
    "plugin/typescript-lsp",
    "plugin/pyright-lsp",
    "plugin/github",
    "plugin/terraform",
    "skill/terraform-skill",
    "plugin/superpowers",
    "plugin/codex",
    "tool/code-review-graph",
    "tool/codegraph",
    "tool/context7",
    "tool/backlog",
    "skill/fastapi",
  ]) assert.ok(ids.includes(id), id);

  for (const component of components) {
    assert.match(component.version, /^\d+\.\d+\.\d+$/);
    assert.ok(component.targets.length);
    assert.ok(component.scopes.length);
    if (component.content?.kind === "bundled") assert.ok(bundledContent(component).length > 20);
  }
});

test("only portable content is offered to Codex", () => {
  const codex = listComponents().filter(({ targets }) => targets.includes("codex"));
  assert.ok(codex.some(({ id }) => id === "skill/audit-code"));
  assert.ok(codex.every(({ kind }) => kind !== "plugin" && kind !== "hook"));
});

test("remote skills are normalized before checksumming and installation", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const revision = "0123456789abcdef0123456789abcdef01234567";
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(url);
    if (url.startsWith("https://api.github.com/")) {
      return { ok: true, json: async () => ({ sha: revision }) };
    }
    return { ok: true, text: async () => "---\r\nname: remote\r\n---\r\n" };
  };
  const component = listComponents().find(({ id }) => id === "skill/fastapi");
  assert.equal(await remoteContent(component), "---\nname: remote\n---\n");
  assert.match(requested[1], new RegExp(revision));

  requested.length = 0;
  const pinned = `https://raw.githubusercontent.com/fastapi/fastapi/${revision}/fastapi/.agents/skills/fastapi/SKILL.md`;
  assert.equal(await lockedRemoteContent(component.id, { resolvedUrl: pinned }), "---\nname: remote\n---\n");
  assert.deepEqual(requested, [pinned]);
});

test("Claude marketplace adapters package canonical skills inside the cached plugin root", () => {
  const marketplace = JSON.parse(fs.readFileSync(path.join(repository, ".claude-plugin", "marketplace.json"), "utf8"));
  assert.equal(marketplace.plugins.length, 4);
  for (const plugin of marketplace.plugins) {
    assert.equal(plugin.source, "./");
    assert.equal(plugin.strict, false);
    assert.equal(plugin.license, "Apache-2.0");
    const componentPaths = [...(plugin.skills ?? []), ...(typeof plugin.hooks === "string" ? [plugin.hooks] : [])];
    assert.ok(componentPaths.length > 0, plugin.name);
    for (const componentPath of componentPaths) {
      assert.ok(fs.existsSync(path.resolve(repository, componentPath)), `${plugin.name}: ${componentPath}`);
    }
  }
});
