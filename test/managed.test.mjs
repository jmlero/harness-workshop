import assert from "node:assert/strict";
import test from "node:test";
import { integrity } from "../src/integrity.mjs";
import {
  managedPayload,
  removeManagedBlock,
  upsertManagedBlock,
} from "../src/managed.mjs";

const component = { id: "block/example", version: "1.0.0" };
const content = "## Example\n\nKeep this rule.\n";

test("managed blocks use compact boundaries without prompt metadata", () => {
  const document = upsertManagedBlock("# Existing\n", component, content);
  assert.match(document, /<!--hw:block\/example-->/);
  assert.match(document, /<!--\/hw:block\/example-->/);
  assert.doesNotMatch(document, /source|integrity|1\.0\.0/);
  assert.equal(managedPayload(document, component.id), content);
  assert.equal(removeManagedBlock(document, component.id), "# Existing\n");
});

test("legacy verbose blocks remain readable and migrate on update", () => {
  const legacy = [
    "# Existing",
    "",
    "<!-- harness-workshop:start block/example -->",
    `<!-- harness-workshop:source block/example@1.0.0 integrity ${integrity(content)} -->`,
    content.trimEnd(),
    "<!-- harness-workshop:end block/example -->",
    "",
  ].join("\n");
  assert.equal(managedPayload(legacy, component.id), content);
  const migrated = upsertManagedBlock(legacy, component, content);
  assert.match(migrated, /<!--hw:block\/example-->/);
  assert.doesNotMatch(migrated, /harness-workshop:source/);
  assert.equal(managedPayload(migrated, component.id), content);
});
