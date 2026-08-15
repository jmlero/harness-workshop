import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  availableWithAdapters,
  bundledContent,
  isPortable,
  listComponents,
  lockedRemoteContent,
  remoteContent,
} from "../src/catalog.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("catalog contains every ported component with stable metadata", () => {
  const components = listComponents();
  const ids = components.map(({ id }) => id);
  assert.equal(components.length, 20);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    "block/tdd",
    "block/ponytail",
    "skill/audit-code",
    "skill/audit-docs",
    "skill/review-pr",
    "skill/ponytail",
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
    assert.ok(component.scopes.length);
    assert.equal(Object.hasOwn(component, "targets"), false);
    if (component.adapters) assert.deepEqual(component.adapters, ["claude"]);
    if (component.content?.kind === "bundled") assert.ok(bundledContent(component).length > 20);
  }
});

test("adapted bundled components retain pinned upstream attribution", () => {
  const ponytail = listComponents().filter(({ id }) => new Set(["block/ponytail", "skill/ponytail"]).has(id));
  assert.equal(ponytail.length, 2);
  for (const component of ponytail) {
    assert.equal(component.license, "MIT");
    assert.equal(component.content.upstream, "DietrichGebert/ponytail");
    assert.match(component.content.revision, /^[0-9a-f]{40}$/);
    assert.match(bundledContent(component), /smallest/i);
  }
  assert.match(fs.readFileSync(path.join(repository, "THIRD_PARTY_NOTICES.md"), "utf8"), /DietrichGebert\/ponytail/);
});

test("portable components are vendor-neutral and adapters expose only compatible edges", () => {
  const components = listComponents();
  const portable = components.filter(isPortable);
  const claude = components.filter((component) => availableWithAdapters(component, ["claude"]));

  assert.ok(portable.some(({ id }) => id === "block/tdd"));
  assert.ok(portable.some(({ id }) => id === "skill/audit-code"));
  assert.ok(portable.every(({ kind }) => kind !== "plugin" && kind !== "hook"));
  assert.ok(portable.every((component) => component.adapters === undefined));
  assert.equal(claude.length, components.length);
  assert.equal(availableWithAdapters(components.find(({ id }) => id === "plugin/github"), []), false);
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
