import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  availableWithAdapters,
  bundledContent,
  bundledPackage,
  isPortable,
  listComponents,
  lockedRemoteContent,
  lockedRemotePackage,
  remoteContent,
  resolveRemotePackage,
} from "../src/catalog.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("catalog contains every ported component with stable metadata", () => {
  const components = listComponents();
  const ids = components.map(({ id }) => id);
  assert.equal(components.length, 21);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    "block/tdd",
    "block/ponytail",
    "skill/audit-code",
    "skill/audit-docs",
    "skill/review-pr",
    "skill/ponytail",
    "command/verify-work",
    "command/commit-work",
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
    "tool/backlog",
    "skill/fastapi",
  ]) assert.ok(ids.includes(id), id);

  for (const component of components) {
    assert.match(component.version, /^\d+\.\d+\.\d+$/);
    assert.ok(component.scopes.length);
    assert.equal(Object.hasOwn(component, "targets"), false);
    if (component.id === "hook/slim-cli") assert.deepEqual(component.adapters, ["claude", "grok"]);
    else if (component.adapters) assert.deepEqual(component.adapters, ["claude"]);
    if (component.content?.kind === "bundled") assert.ok(bundledContent(component).length > 20);
  }
});

test("workflow commands are complete, explicitly invoked Agent Skill packages", () => {
  for (const id of ["command/verify-work", "command/commit-work"]) {
    const component = listComponents().find((candidate) => candidate.id === id);
    assert.equal(component.context.loading, "explicit");
    const files = bundledPackage(component);
    assert.deepEqual(files.map(({ path: file }) => file), ["agents/openai.yaml", "SKILL.md"]);
    assert.match(files.find(({ path: file }) => file === "SKILL.md").content, /^---\nname: [a-z-]+\ndescription: .+\n---/);
    assert.match(files.find(({ path: file }) => file === "agents/openai.yaml").content, /allow_implicit_invocation: false/);
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
  const grok = components.filter((component) => availableWithAdapters(component, ["grok"]));

  assert.ok(portable.some(({ id }) => id === "block/tdd"));
  assert.ok(portable.some(({ id }) => id === "skill/audit-code"));
  assert.ok(portable.every(({ kind }) => kind !== "plugin" && kind !== "hook"));
  assert.ok(portable.every((component) => component.adapters === undefined));
  assert.equal(claude.length, components.length);
  assert.equal(grok.length, portable.length + 1);
  assert.ok(grok.some(({ id }) => id === "hook/slim-cli"));
  assert.equal(availableWithAdapters(components.find(({ id }) => id === "plugin/github"), []), false);
});

test("remote skill directories are pinned, normalized, checksummed, and complete", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const revision = "0123456789abcdef0123456789abcdef01234567";
  const treeSha = "89abcdef0123456789abcdef0123456789abcdef";
  const requested = [];
  globalThis.fetch = async (url) => {
    const value = String(url);
    requested.push(value);
    if (value.includes("/commits/")) {
      return { ok: true, json: async () => ({ sha: revision, commit: { tree: { sha: treeSha } } }) };
    }
    if (value.includes("/git/trees/")) {
      return {
        ok: true,
        json: async () => ({
          truncated: false,
          tree: [
            { path: "fastapi/.agents/skills/fastapi/SKILL.md", type: "blob", mode: "100644", size: 80 },
            { path: "fastapi/.agents/skills/fastapi/references/dependencies.md", type: "blob", mode: "100644", size: 20 },
            { path: "LICENSE", type: "blob", mode: "100644", size: 10 },
          ],
        }),
      };
    }
    if (value.endsWith("/SKILL.md")) {
      return { ok: true, text: async () => "---\r\nname: fastapi\r\ndescription: Remote skill.\r\n---\r\n\r\n# FastAPI\r\n" };
    }
    if (value.endsWith("/references/dependencies.md")) {
      return { ok: true, text: async () => "# Dependencies\r\n" };
    }
    if (value.endsWith("/LICENSE")) return { ok: true, text: async () => "MIT License\r\n" };
    return { ok: false, status: 404 };
  };
  const component = listComponents().find(({ id }) => id === "skill/fastapi");
  const resolved = await resolveRemotePackage(component);
  assert.deepEqual(resolved.files.map(({ path: file }) => file), [
    "LICENSE",
    "references/dependencies.md",
    "SKILL.md",
  ]);
  assert.match(resolved.files.find(({ path: file }) => file === "SKILL.md").content, /Project compatibility/);
  assert.equal(resolved.files.find(({ path: file }) => file === "references/dependencies.md").content, "# Dependencies\n");
  assert.equal(resolved.source.revision, revision);
  assert.equal(resolved.source.resolvedFiles.length, 3);
  assert.ok(resolved.source.resolvedFiles.every((file) => /^sha256-/.test(file.integrity)));
  assert.match(requested.find((url) => url.includes("/git/trees/")), new RegExp(treeSha));

  requested.length = 0;
  const locked = await lockedRemotePackage(component, resolved.source);
  assert.deepEqual(locked.files, resolved.files);
  assert.ok(requested.every((url) => url.startsWith("https://raw.githubusercontent.com/")));
  assert.equal(await lockedRemoteContent(component, resolved.source), await remoteContent(component));
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
