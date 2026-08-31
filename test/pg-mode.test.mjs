import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const SKILL_ROOT = new URL("plugins/fable-ous/skills/pg-mode/", ROOT);
const CLAUDE_COMMAND = new URL("plugins/fable-ous/commands/pg-mode.md", ROOT);

function read(relativePath) {
  return readFileSync(new URL(relativePath, SKILL_ROOT), "utf8");
}

function body(markdown) {
  return markdown.replace(/^---\n[\s\S]*?\n---\n+/, "");
}

test("PG mode is discoverable but explicit-only in Codex and Claude Code", () => {
  const skill = read("SKILL.md");
  const codexMetadata = read("agents/openai.yaml");
  const claudeCommand = readFileSync(CLAUDE_COMMAND, "utf8");

  assert.match(skill, /^name: pg-mode$/m);
  assert.match(skill, /^description: .*only when the user explicitly invokes PG mode.*Do not use automatically/m);
  assert.doesNotMatch(skill, /^disable-model-invocation:/m);
  assert.match(codexMetadata, /^\s*allow_implicit_invocation: false$/m);
  assert.match(codexMetadata, /\$pg-mode/);
  assert.match(claudeCommand, /^disable-model-invocation: true$/m);
  assert.match(skill, /do not silently activate it/i);
  assert.equal(body(skill), body(claudeCommand));
});

test("PG mode is a product lens, not a Paul Graham impersonation or coding authority", () => {
  const skill = read("SKILL.md");

  assert.match(skill, /decision lens/i);
  assert.match(skill, /do not impersonate Paul Graham/i);
  assert.match(skill, /never (?:a |an )?blocker/i);
  assert.match(skill, /does not (?:own|replace|override).*coding.*tests.*review.*safety.*completion/is);
  assert.match(skill, /user's explicit authorization/i);
  assert.match(skill, /do not call a model/i);
});

test("PG mode tests demand before code and preserves a narrow reliable proof", () => {
  const skill = read("SKILL.md");

  for (const requirement of [
    /named user.*pain/is,
    /payment.*use.*praise/is,
    /manual.*does not scale/is,
    /smallest.*reliable/is,
    /repeat(?:ed)? use.*referral/is,
    /founder.*learn/is,
    /delete or defer/is,
    /falsif/is
  ]) {
    assert.match(skill, requirement);
  }
});

test("PG mode adds no runtime, hook, or model dependency", () => {
  assert.equal(existsSync(new URL("hooks/hooks.json", SKILL_ROOT)), false);
  assert.equal(existsSync(new URL("scripts/", SKILL_ROOT)), false);
  const packageJson = JSON.parse(readFileSync(new URL("package.json", ROOT), "utf8"));
  assert.equal(packageJson.dependencies?.["@openai/codex-sdk"], undefined);
  assert.equal(packageJson.dependencies?.["@anthropic-ai/sdk"], undefined);
});
