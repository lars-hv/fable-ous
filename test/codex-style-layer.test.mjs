import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ensureCodexStyleLayer,
  isCodexStyleLayerActive,
  MANAGED_BLOCK_END,
  MANAGED_BLOCK_START,
  removeCodexStyleLayer
} from "../plugins/fable-ous/scripts/activation.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-style-"));
  return {
    agentsPath: join(root, "AGENTS.md"),
    configDir: join(root, "config")
  };
}

test("installs one reversible Codex instruction block and stays idempotent", () => {
  const paths = fixture();
  const first = ensureCodexStyleLayer(paths);
  const second = ensureCodexStyleLayer(paths);
  const content = readFileSync(paths.agentsPath, "utf8");

  assert.equal(first.source, "managed");
  assert.equal(second.source, "managed");
  assert.equal(content.split(MANAGED_BLOCK_START).length - 1, 1);
  assert.equal(content.split(MANAGED_BLOCK_END).length - 1, 1);
  assert.match(content, /40[–-]100 words/i);
  assert.match(content, /changes communication only/i);
  assert.doesNotMatch(content, /continue through safe|do not end while/i);
  assert.equal(isCodexStyleLayerActive(paths), true);
});

test("recognizes an existing strong contract without duplicating it", () => {
  const paths = fixture();
  const existing = `# Working agreement

Lead with one recommendation and why it matters.
Use warm, plain language.
Respond to the user's likely intent and practical need, not just the literal wording.
Keep most work in the background and speak only when a finding, risk, or blocker matters.
Never hide failed verification, uncertainty, risk, or authorization boundaries.
`;
  ensureCodexStyleLayer({ ...paths, existingContent: existing });
  const content = readFileSync(paths.agentsPath, "utf8");

  assert.equal(content, existing);
  assert.equal(content.includes(MANAGED_BLOCK_START), false);
  assert.equal(isCodexStyleLayerActive(paths), true);
});

test("upgrades an older managed block without duplicating it", () => {
  const paths = fixture();
  const old = `${MANAGED_BLOCK_START}\nOld contract.\n${MANAGED_BLOCK_END}\n`;
  ensureCodexStyleLayer({ ...paths, existingContent: old });
  const content = readFileSync(paths.agentsPath, "utf8");

  assert.equal(content.split(MANAGED_BLOCK_START).length - 1, 1);
  assert.doesNotMatch(content, /Old contract/);
  assert.match(content, /changes communication only/i);
  assert.doesNotMatch(content, /continue through safe|do not end while/i);
});

test("uninstall removes only the managed block", () => {
  const paths = fixture();
  ensureCodexStyleLayer({ ...paths, existingContent: "# Keep me\n" });
  const result = removeCodexStyleLayer(paths);
  const content = readFileSync(paths.agentsPath, "utf8");

  assert.equal(result.removed, true);
  assert.equal(content, "# Keep me\n");
  assert.equal(isCodexStyleLayerActive(paths), false);
});
