import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

test("Fable-ous contributes no lifecycle-hook receipts", () => {
  const root = new URL("../", import.meta.url);
  expect(existsSync(new URL("plugins/fable-ous/hooks/hooks.json", root))).toBe(false);
  expect(existsSync(new URL("plugins/fable-ous/scripts/hook.mjs", root))).toBe(false);
});

test("Fable-ous stays inside the native plugin boundary", () => {
  const root = new URL("../", import.meta.url);
  const packageJson = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  const cli = readFileSync(new URL("src/cli.mjs", root), "utf8");

  expect(existsSync(new URL("src/strict.mjs", root))).toBe(false);
  expect(packageJson.dependencies?.["@openai/codex-sdk"]).toBeUndefined();
  expect(cli).not.toMatch(/createStrictSession|runStrictTurn|launchClaude/);
});
