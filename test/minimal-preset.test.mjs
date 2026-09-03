import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { MANAGED_CODEX_CONTRACT } from "../plugins/fable-ous/scripts/activation.mjs";

const ROOT = new URL("../", import.meta.url);
const PLUGIN = new URL("../plugins/fable-ous/", import.meta.url);

const MINIMAL_PRESENTATION = [
  "Lead with the outcome in warm, plain language.",
  "Preserve the evidence needed to trust the result, material caveats or missing proof, and the next action when one exists; omit secondary detail and repetition.",
  "This changes presentation only—not work, safety, verification, or completion criteria."
].join("\n\n");

test("installs only the minimal presentation contract", () => {
  assert.match(MANAGED_CODEX_CONTRACT, new RegExp(MINIMAL_PRESENTATION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const claudeStyle = readFileSync(new URL("output-styles/fable-ous.md", PLUGIN), "utf8");
  assert.match(claudeStyle, new RegExp(MINIMAL_PRESENTATION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const forbiddenBehavior = /autonom|continue|ask|question|likely intent|what changed for the user|within the first 40 words|120-word|delta-only|full day of reading/i;
  assert.doesNotMatch(MANAGED_CODEX_CONTRACT, forbiddenBehavior);
  assert.doesNotMatch(claudeStyle, forbiddenBehavior);
});

test("ships no runtime, linter, command, or skill surface", () => {
  const manifest = JSON.parse(readFileSync(new URL(".codex-plugin/plugin.json", PLUGIN), "utf8"));
  assert.equal("skills" in manifest, false);
  assert.equal(existsSync(new URL("skills/", PLUGIN)), false);
  assert.equal(existsSync(new URL("commands/", PLUGIN)), false);
  assert.equal(existsSync(new URL("scripts/style.mjs", PLUGIN)), false);

  const cli = fileURLToPath(new URL("bin/fable-ous.mjs", ROOT));
  const help = spawnSync(process.execPath, [cli, "help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.doesNotMatch(help.stdout, /\blint\b|PG mode|voice-status/i);
  assert.match(help.stdout, /fable-ous install/);
  assert.match(help.stdout, /fable-ous doctor/);
  assert.match(help.stdout, /fable-ous style-off/);
});

test("keeps Claude compatibility explicit instead of reinstalling it by default", () => {
  const source = readFileSync(new URL("src/cli.mjs", ROOT), "utf8");
  assert.match(source, /options\["with-claude"\]/);
  assert.doesNotMatch(source, /!options\["codex-only"\]/);

  const cli = fileURLToPath(new URL("bin/fable-ous.mjs", ROOT));
  const help = spawnSync(process.execPath, [cli, "help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /install \[--with-claude\]/);
});
