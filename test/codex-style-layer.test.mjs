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
  assert.equal(isCodexStyleLayerActive(paths), true);
});

test("recognizes an existing strong contract without duplicating it", () => {
  const paths = fixture();
  const existing = `# Working agreement

Lead with one recommendation and why it matters.
Keep most work in the background and only report material changes.
Do not ask routine permission questions for safe reversible work.
Never hide failed verification, uncertainty, risk, or authorization boundaries.
`;
  ensureCodexStyleLayer({ ...paths, existingContent: existing });
  const content = readFileSync(paths.agentsPath, "utf8");

  assert.equal(content, existing);
  assert.equal(content.includes(MANAGED_BLOCK_START), false);
  assert.equal(isCodexStyleLayerActive(paths), true);
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
