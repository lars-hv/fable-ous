import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ensureNativeCodexPreferences,
  ensureCodexStyleLayer,
  isCodexStyleLayerActive,
  MANAGED_CODEX_CONTRACT,
  MANAGED_BLOCK_END,
  MANAGED_BLOCK_START,
  nativeCodexPreferenceValues,
  removeNativeCodexPreferences,
  removeCodexStyleLayer
} from "../plugins/fable-ous/scripts/activation.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-style-"));
  return {
    agentsPath: join(root, "AGENTS.md"),
    configDir: join(root, "state"),
    codexConfigPath: join(root, "config.toml")
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
  assert.match(content, /completeness and clarity matter more than shortness/i);
  assert.match(content, /never reduce necessary work/i);
  assert.match(content, /changes communication only/i);
  assert.match(content, /does not replace or override coding workflow/i);
  assert.match(content, /user-visible handoff/i);
  assert.match(content, /without forcing a follow-up/i);
  assert.match(content, /what changed for the user and why it matters/i);
  assert.match(content, /concrete evidence/i);
  assert.match(content, /one exact next action only when something remains/i);
  assert.match(content, /when installed or customer behavior is part of the outcome/i);
  assert.doesNotMatch(content, /continue through safe|do not end while/i);
  assert.equal(isCodexStyleLayerActive(paths), true);
});

test("installs its exact managed contract even when user instructions look similar", () => {
  const paths = fixture();
  const existing = `# Working agreement

Lead with one recommendation and why it matters.
Use warm, plain language.
Respond to the user's likely intent and practical need, not just the literal wording.
Explain what changed for the user and why it matters.
Never hide failed verification, uncertainty, risk, or authorization boundaries.
`;
  const result = ensureCodexStyleLayer({ ...paths, existingContent: existing });
  const content = readFileSync(paths.agentsPath, "utf8");

  assert.equal(result.source, "managed");
  assert.equal(result.changed, true);
  assert.match(content, /^# Working agreement/m);
  assert.equal(content.split(MANAGED_BLOCK_START).length - 1, 1);
  assert.equal(content.split(MANAGED_BLOCK_END).length - 1, 1);
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

test("refuses malformed managed markers without appending a duplicate contract", () => {
  const paths = fixture();
  const malformed = `# Keep me\n\n${MANAGED_BLOCK_START}\ntruncated\n`;

  assert.throws(
    () => ensureCodexStyleLayer({ ...paths, existingContent: malformed }),
    /malformed Fable-ous block/i
  );
  assert.equal(existsSync(paths.agentsPath), false);
  assert.equal(existsSync(join(paths.configDir, "standard.json")), false);
});

test("style removal preserves both the file and marker when managed markers are malformed", () => {
  const paths = fixture();
  ensureCodexStyleLayer(paths);
  const malformed = readFileSync(paths.agentsPath, "utf8").replace(MANAGED_BLOCK_END, "");
  writeFileSync(paths.agentsPath, malformed);

  assert.throws(() => removeCodexStyleLayer(paths), /malformed Fable-ous block/i);
  assert.equal(readFileSync(paths.agentsPath, "utf8"), malformed);
  assert.equal(existsSync(join(paths.configDir, "standard.json")), true);
});

test("style removal preserves its marker when AGENTS.md cannot be read safely", () => {
  const paths = fixture();
  mkdirSync(paths.agentsPath);
  mkdirSync(paths.configDir, { recursive: true });
  writeFileSync(join(paths.configDir, "standard.json"), `${JSON.stringify({ schema: 1, source: "managed" })}\n`);

  assert.throws(() => removeCodexStyleLayer(paths), /Cannot safely read/i);
  assert.equal(existsSync(join(paths.configDir, "standard.json")), true);
});

test("reports a stale or edited managed block as inactive until install repairs it", () => {
  const paths = fixture();
  ensureCodexStyleLayer(paths);
  writeFileSync(paths.agentsPath, readFileSync(paths.agentsPath, "utf8").replace(
    "Use warm, plain adult-to-adult language.",
    "Use opaque internal jargon."
  ));

  assert.equal(isCodexStyleLayerActive(paths), false);
  ensureCodexStyleLayer(paths);
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

test("native calm preferences leave verbosity to the user and stay reversible", () => {
  const paths = fixture();
  const original = `model = "gpt-5.6-sol"\npersonality = "pragmatic"\n\n[features]\nplugins = true\n`;
  const first = ensureNativeCodexPreferences({ ...paths, existingContent: original });
  const second = ensureNativeCodexPreferences(paths);
  const active = readFileSync(paths.codexConfigPath, "utf8");

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.match(active, /^personality = "friendly"$/m);
  assert.match(active, /^hide_agent_reasoning = true$/m);
  assert.doesNotMatch(active, /^model_verbosity\s*=/m);

  const removed = removeNativeCodexPreferences(paths);
  assert.equal(removed.restored, true);
  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), original);
});

test("native preference removal preserves a user change made after install", () => {
  const paths = fixture();
  ensureNativeCodexPreferences({ ...paths, existingContent: "personality = \"pragmatic\"\n" });
  const customized = readFileSync(paths.codexConfigPath, "utf8").replace(
    'personality = "friendly"',
    'personality = "none"'
  );
  writeFileSync(paths.codexConfigPath, customized);

  removeNativeCodexPreferences(paths);
  assert.match(readFileSync(paths.codexConfigPath, "utf8"), /^personality = "none"$/m);
});

test("reinstall snapshots the user's latest preference before applying Fable-ous again", () => {
  const paths = fixture();
  ensureNativeCodexPreferences({ ...paths, existingContent: `personality = "pragmatic"\n` });
  writeFileSync(paths.codexConfigPath, readFileSync(paths.codexConfigPath, "utf8")
    .replace('personality = "friendly"', 'personality = "none"'));

  ensureNativeCodexPreferences(paths);
  assert.equal(removeNativeCodexPreferences(paths).restored, true);
  assert.match(readFileSync(paths.codexConfigPath, "utf8"), /^personality = "none"$/m);
});

test("native preferences preserve a user-owned verbosity setting", () => {
  const paths = fixture();
  const original = `'personality' = 'pragmatic'\n"model_verbosity" = 'medium'\n\n[features]\nplugins = true\n`;
  ensureNativeCodexPreferences({ ...paths, existingContent: original });
  const active = readFileSync(paths.codexConfigPath, "utf8");

  assert.equal((active.match(/personality/g) || []).length, 1);
  assert.match(active, /^"model_verbosity" = 'medium'$/m);
  assert.deepEqual(nativeCodexPreferenceValues(paths), {
    personality: "friendly",
    hide_agent_reasoning: "true"
  });
  assert.equal(removeNativeCodexPreferences(paths).restored, true);
  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), original);
});

test("upgrade restores the verbosity value managed by an older release", () => {
  const paths = fixture();
  const original = `model = "gpt-5.6-sol"\nmodel_verbosity = "medium"\n`;
  mkdirSync(paths.configDir, { recursive: true });
  writeFileSync(paths.codexConfigPath, `hide_agent_reasoning = true\npersonality = "friendly"\nmodel = "gpt-5.6-sol"\nmodel_verbosity = "low"\n`);
  writeFileSync(join(paths.configDir, "native-preferences.json"), `${JSON.stringify({
    schema: 1,
    original: {
      personality: { present: false },
      model_verbosity: { present: true, line: 'model_verbosity = "medium"' },
      hide_agent_reasoning: { present: false }
    }
  })}\n`);

  ensureNativeCodexPreferences(paths);
  assert.match(readFileSync(paths.codexConfigPath, "utf8"), /^model_verbosity = "medium"$/m);
  assert.equal(removeNativeCodexPreferences(paths).restored, true);
  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), original);
});

test("upgrade preserves a verbosity value the user changed after install", () => {
  const paths = fixture();
  mkdirSync(paths.configDir, { recursive: true });
  writeFileSync(paths.codexConfigPath, `model_verbosity = "high"\npersonality = "friendly"\nhide_agent_reasoning = true\n`);
  writeFileSync(join(paths.configDir, "native-preferences.json"), `${JSON.stringify({
    schema: 1,
    original: {
      personality: { present: false },
      model_verbosity: { present: true, line: 'model_verbosity = "medium"' },
      hide_agent_reasoning: { present: false }
    }
  })}\n`);

  ensureNativeCodexPreferences(paths);
  assert.match(readFileSync(paths.codexConfigPath, "utf8"), /^model_verbosity = "high"$/m);
  removeNativeCodexPreferences(paths);
  assert.match(readFileSync(paths.codexConfigPath, "utf8"), /^model_verbosity = "high"$/m);
});

test("native preferences stop at CRLF TOML table headers", () => {
  const paths = fixture();
  const original = `model = "gpt-5.6-sol"\r\n\r\n[profiles.work]\r\npersonality = "none"\r\n`;
  ensureNativeCodexPreferences({ ...paths, existingContent: original });
  const active = readFileSync(paths.codexConfigPath, "utf8");

  assert.match(active, /^personality = "friendly"$/m);
  assert.match(active, /\[profiles\.work\]\r\npersonality = "none"/);
  removeNativeCodexPreferences(paths);
  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), original);
});

test("style-off restores semantically managed values after harmless TOML reformatting", () => {
  const paths = fixture();
  const original = `personality = "pragmatic"\n`;
  ensureNativeCodexPreferences({ ...paths, existingContent: original });
  const reformatted = readFileSync(paths.codexConfigPath, "utf8")
    .replace('personality = "friendly"', "personality = 'friendly' # formatted");
  writeFileSync(paths.codexConfigPath, reformatted);

  assert.equal(removeNativeCodexPreferences(paths).restored, true);
  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), original);
});

test("an unknown preference marker is preserved instead of losing rollback evidence", () => {
  const paths = fixture();
  mkdirSync(paths.configDir, { recursive: true });
  writeFileSync(paths.codexConfigPath, `personality = "friendly"\n`);
  writeFileSync(join(paths.configDir, "native-preferences.json"), '{"schema":99}\n');

  const result = removeNativeCodexPreferences(paths);
  assert.equal(result.restored, false);
  assert.equal(result.markerPreserved, true);
  assert.equal(existsSync(join(paths.configDir, "native-preferences.json")), true);
});

test("install refuses an invalid rollback marker without changing Codex config", () => {
  const paths = fixture();
  mkdirSync(paths.configDir, { recursive: true });
  const original = `personality = "pragmatic"\n`;
  writeFileSync(paths.codexConfigPath, original);
  writeFileSync(join(paths.configDir, "native-preferences.json"), '{"schema":1}\n');

  assert.throws(() => ensureNativeCodexPreferences(paths), /invalid rollback marker/i);
  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), original);
});

test("communication surfaces contain no stopping or completion policy", () => {
  const root = new URL("../", import.meta.url);
  const surfaces = [
    "plugins/fable-ous/.codex-plugin/plugin.json",
    "plugins/fable-ous/output-styles/fable-ous.md",
    "plugins/fable-ous/scripts/activation.mjs",
    "plugins/fable-ous/scripts/style.mjs",
    "plugins/fable-ous/skills/voice-status/SKILL.md",
  ];
  const forbidden = /do not end while|continue through safe|finish when|work remains|optional improvements are not unfinished/i;

  for (const relative of surfaces) {
    assert.doesNotMatch(readFileSync(new URL(relative, root), "utf8"), forbidden, relative);
  }
});

test("Codex and Claude carry the same communication-only outcome contract", () => {
  const claudeStyle = readFileSync(
    new URL("../plugins/fable-ous/output-styles/fable-ous.md", import.meta.url),
    "utf8"
  );
  for (const pattern of [
    /likely intent and practical need/i,
    /warm[^\n]*plain|plain[^\n]*warm/i,
    /completeness and clarity matter more than shortness/i,
    /never reduce necessary work/i,
    /user-visible handoff/i,
    /without forcing a follow-up/i,
    /what changed for the user and why it matters/i,
    /concrete evidence/i,
    /one exact next action only when something remains/i,
    /when installed or customer behavior is part of the outcome/i,
    /changes communication only/i,
    /does not replace or override/i
  ]) {
    assert.match(MANAGED_CODEX_CONTRACT, pattern);
    assert.match(claudeStyle, pattern);
  }
  assert.match(claudeStyle, /keep-coding-instructions:\s*true/i);
  assert.match(claudeStyle, /force-for-plugin:\s*true/i);
});
