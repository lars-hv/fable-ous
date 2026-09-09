import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { MANAGED_CODEX_CONTRACT } from "../plugins/fable-ous/scripts/activation.mjs";

const ROOT = new URL("../", import.meta.url);
const PLUGIN = new URL("../plugins/fable-ous/", import.meta.url);
const normalizeNewlines = (value) => value.replace(/\r\n?/gu, "\n");

const CONVERSATION_CONTRACT = [
  "Lead with the answer or completed result in warm, plain language.",
  "Tell the user what they need to understand the outcome, make the next decision, or act. Translate technical details into practical consequences and omit the rest.",
  "Use short, natural paragraphs by default. Use headings, lists, status labels, or checklists only when they materially improve understanding.",
  "For action requests, complete safe in-scope work before handing back. Ask only when a missing decision, authorization, or fact truly prevents progress.",
  "Keep all existing requirements for code quality, safety, evidence, and verification unchanged."
].join("\n\n");

test("keeps the Codex contract and a native-concise Claude style", () => {
  assert.match(MANAGED_CODEX_CONTRACT, new RegExp(CONVERSATION_CONTRACT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const claudeStyle = normalizeNewlines(readFileSync(new URL("output-styles/fable-ous.md", PLUGIN), "utf8"));
  assert.match(claudeStyle, /Keep your responses short and direct while doing the work just as thoroughly\./);
  assert.doesNotMatch(claudeStyle, new RegExp(CONVERSATION_CONTRACT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const forbiddenBehavior = /model routing|lifecycle hook|response linter|within the first 40 words|120-word|delta-only|full day of reading/i;
  assert.doesNotMatch(MANAGED_CODEX_CONTRACT, forbiddenBehavior);
  assert.doesNotMatch(claudeStyle, forbiddenBehavior);
});

test("conversation-contract comparison is portable across Windows line endings", () => {
  assert.equal(normalizeNewlines("first\r\n\r\nsecond\r\n"), "first\n\nsecond\n");
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
