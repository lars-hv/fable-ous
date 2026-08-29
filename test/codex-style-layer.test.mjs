import assert from "node:assert/strict";
import fs from "node:fs";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertSafeCodexCommunicationPaths,
  ensureCodexCommunicationLayer,
  ensureNativeCodexPreferences,
  ensureCodexStyleLayer,
  isNativeCodexPreferencesActive,
  isCodexStyleLayerActive,
  MANAGED_CODEX_CONTRACT,
  MANAGED_BLOCK_END,
  MANAGED_BLOCK_START,
  nativeCodexPreferenceValues,
  removeCodexCommunicationLayer,
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

function withConcurrentEditAfterRead(path, readNumber, content, callback) {
  const originalRead = fs.readFileSync;
  const originalWrite = fs.writeFileSync;
  let reads = 0;
  fs.readFileSync = function patchedRead(candidate, ...args) {
    const value = originalRead.call(this, candidate, ...args);
    if (String(candidate) === path && ++reads === readNumber) {
      originalWrite.call(this, path, content);
    }
    return value;
  };
  syncBuiltinESMExports();
  try {
    return callback();
  } finally {
    fs.readFileSync = originalRead;
    syncBuiltinESMExports();
  }
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
  assert.match(content, /wording and presentation only/i);
  assert.match(content, /neither selects work nor changes/i);
  assert.match(content, /user-visible handoff/i);
  assert.match(content, /without forcing a follow-up/i);
  assert.match(content, /what changed for the user and why it matters/i);
  assert.match(content, /concrete evidence/i);
  assert.match(content, /without creating or relaxing completion criteria/i);
  assert.match(content, /one exact next action only when something remains/i);
  assert.match(content, /when installed or customer behavior is part of the outcome/i);
  assert.doesNotMatch(content, /continue through safe|do not end while|do the inspection|do all necessary work|never reduce necessary work|likely intent/i);
  assert.equal(isCodexStyleLayerActive(paths), true);
});

test("successful managed writes preserve existing modes and create private files", {
  skip: process.platform === "win32"
}, () => {
  const paths = fixture();
  writeFileSync(paths.codexConfigPath, 'personality = "pragmatic"\n');
  writeFileSync(paths.agentsPath, "# User rules\n");
  chmodSync(paths.codexConfigPath, 0o640);
  chmodSync(paths.agentsPath, 0o644);

  ensureNativeCodexPreferences(paths);
  ensureCodexStyleLayer(paths);

  assert.equal(lstatSync(paths.codexConfigPath).mode & 0o7777, 0o640);
  assert.equal(lstatSync(paths.agentsPath).mode & 0o7777, 0o644);
  assert.equal(lstatSync(join(paths.configDir, "native-preferences.json")).mode & 0o7777, 0o600);
  assert.equal(lstatSync(join(paths.configDir, "standard.json")).mode & 0o7777, 0o600);
});

test("install rollback preserves a concurrent user edit and reports the rollback conflict", {
  skip: process.platform === "win32"
}, () => {
  const paths = fixture();
  const agentsDir = join(paths.configDir, "separate-agents");
  const agentsPath = join(agentsDir, "AGENTS.md");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(agentsPath, "# User rules\n");
  ensureNativeCodexPreferences(paths);
  const originalMarker = readFileSync(join(paths.configDir, "native-preferences.json"));
  const concurrent = 'personality = "none"\nhide_agent_reasoning = true\n';
  let resolutions = 0;
  const options = {
    codexConfigPath: paths.codexConfigPath,
    configDir: paths.configDir,
    get agentsPath() {
      resolutions++;
      if (resolutions === 3) writeFileSync(paths.codexConfigPath, concurrent);
      return agentsPath;
    }
  };
  chmodSync(agentsDir, 0o500);
  try {
    assert.throws(
      () => ensureCodexCommunicationLayer(options),
      /rollback was incomplete|restore every Fable-ous owned path/i
    );
  } finally {
    chmodSync(agentsDir, 0o700);
  }

  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), concurrent);
  assert.deepEqual(readFileSync(join(paths.configDir, "native-preferences.json")), originalMarker);
  assert.equal(readFileSync(agentsPath, "utf8"), "# User rules\n");
  assert.equal(existsSync(join(paths.configDir, "standard.json")), false);
});

test("style-off rollback preserves a concurrent user edit and reports the rollback conflict", {
  skip: process.platform === "win32"
}, () => {
  const paths = fixture();
  const agentsDir = join(paths.configDir, "separate-agents");
  const agentsPath = join(agentsDir, "AGENTS.md");
  mkdirSync(agentsDir, { recursive: true });
  const managedPaths = { ...paths, agentsPath };
  ensureNativeCodexPreferences(managedPaths);
  ensureCodexStyleLayer(managedPaths);
  const originalAgents = readFileSync(agentsPath);
  const originalMarker = readFileSync(join(paths.configDir, "native-preferences.json"));
  const concurrent = 'personality = "none"\n';
  let resolutions = 0;
  const options = {
    codexConfigPath: paths.codexConfigPath,
    configDir: paths.configDir,
    get agentsPath() {
      resolutions++;
      if (resolutions === 3) writeFileSync(paths.codexConfigPath, concurrent);
      return agentsPath;
    }
  };
  chmodSync(agentsDir, 0o500);
  try {
    assert.throws(
      () => removeCodexCommunicationLayer(options),
      /rollback was incomplete|restore every Fable-ous owned path/i
    );
  } finally {
    chmodSync(agentsDir, 0o700);
  }

  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), concurrent);
  assert.deepEqual(readFileSync(join(paths.configDir, "native-preferences.json")), originalMarker);
  assert.deepEqual(readFileSync(agentsPath), originalAgents);
  assert.equal(existsSync(join(paths.configDir, "standard.json")), true);
});

test("install refuses to overwrite a config edit made after its read", () => {
  const paths = fixture();
  const original = 'personality = "pragmatic"\n';
  const concurrent = 'personality = "none"\nhide_agent_reasoning = true\n';
  writeFileSync(paths.codexConfigPath, original);

  withConcurrentEditAfterRead(paths.codexConfigPath, 3, concurrent, () => {
    assert.throws(
      () => ensureCodexCommunicationLayer(paths),
      /concurrent change|rollback was incomplete/i
    );
  });

  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), concurrent);
  const nativeMarker = join(paths.configDir, "native-preferences.json");
  assert.equal(existsSync(nativeMarker), false);
  assert.equal(removeNativeCodexPreferences(paths).restored, false);
  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), concurrent);
  assert.equal(existsSync(nativeMarker), false);
  assert.equal(existsSync(paths.agentsPath), false);
});

test("style-off refuses to overwrite an AGENTS edit made after its read", () => {
  const paths = fixture();
  ensureNativeCodexPreferences(paths);
  ensureCodexStyleLayer(paths);
  const concurrent = "# Concurrent owner edit\n";

  withConcurrentEditAfterRead(paths.agentsPath, 3, concurrent, () => {
    assert.throws(
      () => removeCodexCommunicationLayer(paths),
      /concurrent change|rollback was incomplete/i
    );
  });

  assert.equal(readFileSync(paths.agentsPath, "utf8"), concurrent);
  assert.equal(existsSync(join(paths.configDir, "standard.json")), true);
  assert.equal(existsSync(join(paths.configDir, "native-preferences.json")), true);
});

test("install keeps rollback evidence when a concurrent config edit leaves a managed setting", {
  skip: process.platform === "win32"
}, () => {
  const paths = fixture();
  const agentsDir = join(paths.configDir, "separate-agents-marker-retention");
  const agentsPath = join(agentsDir, "AGENTS.md");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(agentsPath, "# User rules\n");
  writeFileSync(paths.codexConfigPath, 'personality = "pragmatic"\n');
  const concurrent = 'personality = "none"\nhide_agent_reasoning = true\n';
  let resolutions = 0;
  const options = {
    codexConfigPath: paths.codexConfigPath,
    configDir: paths.configDir,
    get agentsPath() {
      resolutions++;
      if (resolutions === 3) writeFileSync(paths.codexConfigPath, concurrent);
      return agentsPath;
    }
  };
  chmodSync(agentsDir, 0o500);
  try {
    assert.throws(
      () => ensureCodexCommunicationLayer(options),
      /rollback was incomplete|restore every Fable-ous owned path/i
    );
  } finally {
    chmodSync(agentsDir, 0o700);
  }

  const nativeMarker = join(paths.configDir, "native-preferences.json");
  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), concurrent);
  assert.equal(existsSync(nativeMarker), true);
  assert.equal(removeNativeCodexPreferences(paths).restored, true);
  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), 'personality = "none"\n');
  assert.equal(existsSync(nativeMarker), false);
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

test("managed AGENTS insertion and removal preserve surrounding owner bytes", () => {
  const inserted = fixture();
  const original = "  # Owner rules  \n\t ";
  writeFileSync(inserted.agentsPath, original);
  ensureCodexStyleLayer(inserted);
  assert.equal(readFileSync(inserted.agentsPath, "utf8").startsWith(original), true);

  const removed = fixture();
  const before = "  # Before  \n\t";
  const after = "  \n  # After\t \n";
  ensureCodexStyleLayer(removed);
  writeFileSync(removed.agentsPath, `${before}${MANAGED_CODEX_CONTRACT}${after}`);
  removeCodexStyleLayer(removed);
  assert.equal(readFileSync(removed.agentsPath, "utf8"), `${before}${after}`);
});

test("upgrades an older managed block without duplicating it", () => {
  const paths = fixture();
  const old = `${MANAGED_BLOCK_START}\nOld contract.\n${MANAGED_BLOCK_END}\n`;
  ensureCodexStyleLayer({ ...paths, existingContent: old });
  const content = readFileSync(paths.agentsPath, "utf8");

  assert.equal(content.split(MANAGED_BLOCK_START).length - 1, 1);
  assert.doesNotMatch(content, /Old contract/);
  assert.match(content, /controls wording and presentation only/i);
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

  assert.throws(() => removeCodexStyleLayer(paths), /regular file/i);
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

test("style status rejects unmatched markers even when one exact contract remains", () => {
  for (const extra of [MANAGED_BLOCK_START, MANAGED_BLOCK_END]) {
    const paths = fixture();
    ensureCodexStyleLayer(paths);
    writeFileSync(paths.agentsPath, `${readFileSync(paths.agentsPath, "utf8")}${extra}\n`);
    assert.throws(() => isCodexStyleLayerActive(paths), /malformed Fable-ous block/i);
  }
});

test("style status refuses AGENTS.md and marker symlinks", {
  skip: process.platform === "win32"
}, () => {
  const agentsSymlink = fixture();
  ensureCodexStyleLayer(agentsSymlink);
  const agentsTarget = join(agentsSymlink.configDir, "linked-AGENTS.md");
  writeFileSync(agentsTarget, readFileSync(agentsSymlink.agentsPath, "utf8"));
  rmSync(agentsSymlink.agentsPath);
  symlinkSync(agentsTarget, agentsSymlink.agentsPath);
  assert.throws(() => isCodexStyleLayerActive(agentsSymlink), /symbolic link/i);

  const markerSymlink = fixture();
  ensureCodexStyleLayer(markerSymlink);
  const markerPath = join(markerSymlink.configDir, "standard.json");
  const markerTarget = join(markerSymlink.configDir, "linked-standard.json");
  writeFileSync(markerTarget, readFileSync(markerPath, "utf8"));
  rmSync(markerPath);
  symlinkSync(markerTarget, markerPath);
  assert.throws(() => isCodexStyleLayerActive(markerSymlink), /symbolic link/i);
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

test("install never creates a full AGENTS.md backup containing user instructions", () => {
  const paths = fixture();
  const original = "# Private working agreement\n\nsynthetic-secret-marker-123\n";
  writeFileSync(paths.agentsPath, original);

  ensureCodexStyleLayer(paths);

  assert.equal(existsSync(`${paths.agentsPath}.fable-ous.bak`), false);
  assert.match(readFileSync(paths.agentsPath, "utf8"), /synthetic-secret-marker-123/);
  removeCodexStyleLayer(paths);
  assert.equal(readFileSync(paths.agentsPath, "utf8"), original);
});

test("a failed AGENTS write removes or restores only the marker written by that attempt", {
  skip: process.platform === "win32"
}, () => {
  for (const originalMarker of [null, '{"schema":1,"source":"older-managed"}\n']) {
    const paths = fixture();
    const locked = join(paths.configDir, "locked");
    paths.agentsPath = join(locked, "AGENTS.md");
    mkdirSync(locked, { recursive: true });
    if (originalMarker !== null) {
      writeFileSync(join(paths.configDir, "standard.json"), originalMarker);
    }
    chmodSync(locked, 0o500);
    try {
      assert.throws(
        () => ensureCodexStyleLayer(paths),
        /permission denied|EACCES/i
      );
      const markerPath = join(paths.configDir, "standard.json");
      if (originalMarker === null) assert.equal(existsSync(markerPath), false);
      else assert.equal(readFileSync(markerPath, "utf8"), originalMarker);
      assert.equal(existsSync(paths.agentsPath), false);
    } finally {
      chmodSync(locked, 0o700);
    }
  }
});

test("upgrade removes only a provably redundant legacy AGENTS.md backup", () => {
  const paths = fixture();
  const original = "# Private working agreement\n\nsynthetic-secret-marker-123\n";
  const oldContract = `${MANAGED_BLOCK_START}\nOld presentation contract.\n${MANAGED_BLOCK_END}`;
  writeFileSync(paths.agentsPath, `${original.trimEnd()}\n\n${oldContract}\n`);
  writeFileSync(`${paths.agentsPath}.fable-ous.bak`, original);

  ensureCodexStyleLayer(paths);

  assert.equal(existsSync(`${paths.agentsPath}.fable-ous.bak`), false);
  assert.match(readFileSync(paths.agentsPath, "utf8"), /synthetic-secret-marker-123/);
});

test("upgrade preserves an unproven user-owned legacy backup", () => {
  const paths = fixture();
  const oldContract = `${MANAGED_BLOCK_START}\nOld presentation contract.\n${MANAGED_BLOCK_END}`;
  writeFileSync(paths.agentsPath, `# Current user rules\n\n${oldContract}\n`);
  writeFileSync(`${paths.agentsPath}.fable-ous.bak`, "# Different historical document\n");

  ensureCodexStyleLayer(paths);

  assert.equal(readFileSync(`${paths.agentsPath}.fable-ous.bak`, "utf8"), "# Different historical document\n");
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

test("table-looking text inside a multiline TOML string does not hide a top-level setting", () => {
  const paths = fixture();
  const original = `note = """\n[looks.like.table]\n"""\npersonality = "pragmatic"\n`;
  ensureNativeCodexPreferences({ ...paths, existingContent: original });
  const active = readFileSync(paths.codexConfigPath, "utf8");

  assert.equal((active.match(/^personality\s*=/gm) || []).length, 1);
  assert.match(active, /^personality = "friendly"$/m);
  assert.equal(removeNativeCodexPreferences(paths).restored, true);
  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), original);
});

test("setting-looking text inside a multiline TOML string is never edited", () => {
  const paths = fixture();
  const original = `note = """\npersonality = "inside text"\n"""\npersonality = "pragmatic"\n`;
  ensureNativeCodexPreferences({ ...paths, existingContent: original });
  const active = readFileSync(paths.codexConfigPath, "utf8");

  assert.match(active, /note = """\npersonality = "inside text"\n"""/);
  assert.equal((active.match(/^personality = "friendly"$/gm) || []).length, 1);
});

test("array-of-table settings never masquerade as top-level Codex settings", () => {
  const paths = fixture();
  const original = `[[profiles]]\npersonality = "none"\n`;
  ensureNativeCodexPreferences({ ...paths, existingContent: original });
  const active = readFileSync(paths.codexConfigPath, "utf8");

  assert.ok(active.indexOf('personality = "friendly"') < active.indexOf("[[profiles]]"));
  assert.match(active, /\[\[profiles\]\]\npersonality = "none"/);
});

test("nested arrays in multiline values never masquerade as TOML table headers", () => {
  const paths = fixture();
  const original = `trusted_groups = [
  ["alpha", "beta"]
]
personality = "pragmatic"
`;

  ensureNativeCodexPreferences({ ...paths, existingContent: original });
  const active = readFileSync(paths.codexConfigPath, "utf8");

  assert.match(active, /trusted_groups = \[\n  \["alpha", "beta"\]\n\]/);
  assert.equal((active.match(/^personality\s*=/gm) || []).length, 1);
  assert.match(active, /^personality = "friendly"$/m);
});

test("an unclosed multiline TOML array fails closed before any mutation", () => {
  const paths = fixture();
  const original = `trusted_groups = [
  ["alpha", "beta"]
personality = "pragmatic"
`;
  writeFileSync(paths.codexConfigPath, original);

  assert.throws(
    () => ensureNativeCodexPreferences(paths),
    /unclosed|unsupported TOML/i
  );
  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), original);
  assert.equal(existsSync(join(paths.configDir, "native-preferences.json")), false);
});

test("dotted keys that define managed preference tables fail closed before mutation", () => {
  for (const original of [
    'personality.voice = "pragmatic"\n',
    '"personality" . voice = "pragmatic"\n',
    'hide_agent_reasoning.enabled = true\n'
  ]) {
    const paths = fixture();
    writeFileSync(paths.codexConfigPath, original);

    assert.throws(
      () => ensureNativeCodexPreferences(paths),
      /conflicting TOML key|cannot safely/i
    );
    assert.equal(readFileSync(paths.codexConfigPath, "utf8"), original);
    assert.equal(existsSync(join(paths.configDir, "native-preferences.json")), false);
  }
});

test("TOML unicode escapes in quoted managed keys cannot create semantic duplicates", () => {
  for (const original of [
    '"\\U00000070ersonality" = "pragmatic"\n',
    '"hide_agent_\\U00000072easoning" = false\n'
  ]) {
    const paths = fixture();
    writeFileSync(paths.codexConfigPath, original);

    ensureNativeCodexPreferences(paths);
    const active = readFileSync(paths.codexConfigPath, "utf8");
    assert.doesNotMatch(active, /\\U000000(?:70|72)/);
    assert.equal(removeNativeCodexPreferences(paths).restored, true);
    assert.equal(readFileSync(paths.codexConfigPath, "utf8"), original);
  }

  const dotted = fixture();
  const conflict = '"\\u0070ersonality" . voice = "pragmatic"\n';
  writeFileSync(dotted.codexConfigPath, conflict);
  assert.throws(
    () => ensureNativeCodexPreferences(dotted),
    /conflicting TOML key|cannot safely/i
  );
  assert.equal(readFileSync(dotted.codexConfigPath, "utf8"), conflict);
  assert.equal(existsSync(join(dotted.configDir, "native-preferences.json")), false);
});

test("inline-table values for managed top-level keys already fail closed before mutation", () => {
  const paths = fixture();
  const original = 'personality = { voice = "pragmatic" }\n';
  writeFileSync(paths.codexConfigPath, original);

  assert.throws(
    () => ensureNativeCodexPreferences(paths),
    /unsupported Codex setting|cannot safely/i
  );
  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), original);
  assert.equal(existsSync(join(paths.configDir, "native-preferences.json")), false);
});

test("complex quoted TOML table headers fail closed without changing user config", () => {
  const paths = fixture();
  const original = `["profile]name"]\npersonality = "none"\n`;

  assert.throws(
    () => ensureNativeCodexPreferences({ ...paths, existingContent: original }),
    /unsupported TOML table header/i,
  );
  assert.equal(existsSync(paths.codexConfigPath), false);
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
    .replace('personality = "friendly"', "  'personality'  =  'friendly'   # owner format");
  writeFileSync(paths.codexConfigPath, reformatted);

  assert.equal(removeNativeCodexPreferences(paths).restored, true);
  assert.equal(
    readFileSync(paths.codexConfigPath, "utf8"),
    "  'personality'  =  'pragmatic'   # owner format\n"
  );
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

test("native preferences are inactive when rollback evidence is corrupt", () => {
  const paths = fixture();
  ensureNativeCodexPreferences(paths);
  writeFileSync(join(paths.configDir, "native-preferences.json"), '{"schema":1,"original":{}}\n');

  assert.equal(isNativeCodexPreferencesActive(paths), false);
  assert.match(readFileSync(paths.codexConfigPath, "utf8"), /^personality = "friendly"$/m);
  assert.match(readFileSync(paths.codexConfigPath, "utf8"), /^hide_agent_reasoning = true$/m);
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

test("install and style-off never replace Codex configuration symlinks", {
  skip: process.platform === "win32"
}, () => {
  const paths = fixture();
  const agentsTarget = join(paths.configDir, "managed-AGENTS.md");
  const configTarget = join(paths.configDir, "managed-config.toml");
  mkdirSync(paths.configDir, { recursive: true });
  writeFileSync(agentsTarget, "# Managed elsewhere\n");
  writeFileSync(configTarget, 'personality = "pragmatic"\n');
  symlinkSync(agentsTarget, paths.agentsPath);
  symlinkSync(configTarget, paths.codexConfigPath);

  assert.throws(() => ensureCodexStyleLayer(paths), /symbolic link/i);
  assert.throws(() => ensureNativeCodexPreferences(paths), /symbolic link/i);
  assert.equal(lstatSync(paths.agentsPath).isSymbolicLink(), true);
  assert.equal(lstatSync(paths.codexConfigPath).isSymbolicLink(), true);
  assert.equal(readFileSync(agentsTarget, "utf8"), "# Managed elsewhere\n");
  assert.equal(readFileSync(configTarget, "utf8"), 'personality = "pragmatic"\n');
  assert.equal(existsSync(join(paths.configDir, "standard.json")), false);
  assert.equal(existsSync(join(paths.configDir, "native-preferences.json")), false);

  writeFileSync(join(paths.configDir, "standard.json"), `${JSON.stringify({ schema: 1, source: "managed" })}\n`);
  writeFileSync(join(paths.configDir, "native-preferences.json"), `${JSON.stringify({
    schema: 1,
    original: {
      personality: { present: true, line: 'personality = "pragmatic"' },
      hide_agent_reasoning: { present: false }
    }
  })}\n`);
  assert.throws(() => removeCodexStyleLayer(paths), /symbolic link/i);
  assert.throws(() => removeNativeCodexPreferences(paths), /symbolic link/i);
  assert.equal(lstatSync(paths.agentsPath).isSymbolicLink(), true);
  assert.equal(lstatSync(paths.codexConfigPath).isSymbolicLink(), true);
  assert.equal(existsSync(join(paths.configDir, "standard.json")), true);
  assert.equal(existsSync(join(paths.configDir, "native-preferences.json")), true);
});

test("all managed communication paths must be absent or regular files", () => {
  for (const key of ["agentsPath", "codexConfigPath", "markerPath", "nativeMarkerPath"]) {
    const paths = fixture();
    const target = key === "markerPath"
      ? join(paths.configDir, "standard.json")
      : key === "nativeMarkerPath"
      ? join(paths.configDir, "native-preferences.json")
      : paths[key];
    mkdirSync(target, { recursive: true });

    assert.throws(
      () => assertSafeCodexCommunicationPaths(paths),
      /regular file/i,
      key
    );
  }
});

test("style-off preserves config and rollback evidence for malformed marker entries", () => {
  const invalidEntries = [
    { personality: { present: true, line: "[invalid" }, hide_agent_reasoning: { present: false } },
    { personality: { present: true, line: 'hide_agent_reasoning = "pragmatic"' }, hide_agent_reasoning: { present: false } },
    { personality: { present: "yes", line: 'personality = "pragmatic"' }, hide_agent_reasoning: { present: false } },
    { personality: { present: false, line: 'personality = "pragmatic"' }, hide_agent_reasoning: { present: false } },
    { personality: { present: true, line: 'personality = "pragmatic"', extra: true }, hide_agent_reasoning: { present: false } },
    { personality: { present: true, line: 'personality = "bad\\q"' }, hide_agent_reasoning: { present: false } }
  ];

  for (const original of invalidEntries) {
    const paths = fixture();
    const managed = 'personality = "friendly"\nhide_agent_reasoning = true\n';
    mkdirSync(paths.configDir, { recursive: true });
    writeFileSync(paths.codexConfigPath, managed);
    writeFileSync(join(paths.configDir, "native-preferences.json"), `${JSON.stringify({ schema: 1, original })}\n`);

    const result = removeNativeCodexPreferences(paths);
    assert.equal(result.restored, false);
    assert.equal(result.markerPreserved, true);
    assert.equal(readFileSync(paths.codexConfigPath, "utf8"), managed);
    assert.equal(existsSync(join(paths.configDir, "native-preferences.json")), true);
  }
});

test("style-off preserves config and rollback evidence when required original entries are missing", () => {
  const incompleteOriginals = [
    {},
    { personality: { present: false } },
    { hide_agent_reasoning: { present: false } }
  ];

  for (const original of incompleteOriginals) {
    const paths = fixture();
    const managed = 'personality = "friendly"\nhide_agent_reasoning = true\n';
    mkdirSync(paths.configDir, { recursive: true });
    writeFileSync(paths.codexConfigPath, managed);
    writeFileSync(join(paths.configDir, "native-preferences.json"), `${JSON.stringify({ schema: 1, original })}\n`);

    const result = removeNativeCodexPreferences(paths);
    assert.equal(result.restored, false);
    assert.equal(result.markerPreserved, true);
    assert.equal(readFileSync(paths.codexConfigPath, "utf8"), managed);
    assert.equal(existsSync(join(paths.configDir, "native-preferences.json")), true);
  }
});

test("install validates every rollback entry before changing config", () => {
  const paths = fixture();
  const original = 'personality = "friendly"\nhide_agent_reasoning = true\n';
  mkdirSync(paths.configDir, { recursive: true });
  writeFileSync(paths.codexConfigPath, original);
  writeFileSync(join(paths.configDir, "native-preferences.json"), `${JSON.stringify({
    schema: 1,
    original: {
      personality: { present: true, line: 'personality = "pragmatic"' },
      hide_agent_reasoning: { present: true, line: "[invalid" }
    }
  })}\n`);

  assert.throws(() => ensureNativeCodexPreferences(paths), /invalid rollback marker/i);
  assert.equal(readFileSync(paths.codexConfigPath, "utf8"), original);
  assert.equal(existsSync(join(paths.configDir, "native-preferences.json")), true);
});

test("CODEX_HOME owns AGENTS.md, config.toml, and Fable-ous state by default", () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-codex-home-"));
  const codexHome = join(root, "custom-codex");
  const env = { CODEX_HOME: codexHome };

  const style = ensureCodexStyleLayer({ env });
  const preferences = ensureNativeCodexPreferences({ env });

  assert.equal(style.agentsPath, join(codexHome, "AGENTS.md"));
  assert.equal(style.configDir, join(codexHome, "fable-ous"));
  assert.equal(preferences.codexConfigPath, join(codexHome, "config.toml"));
  assert.equal(preferences.nativeMarkerPath, join(codexHome, "fable-ous", "native-preferences.json"));
  assert.equal(existsSync(join(codexHome, "AGENTS.md")), true);
  assert.equal(existsSync(join(codexHome, "config.toml")), true);
});

test("explicit FABLE_OUS paths take precedence over CODEX_HOME", () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-overrides-"));
  const env = {
    CODEX_HOME: join(root, "codex"),
    FABLE_OUS_AGENTS_PATH: join(root, "explicit", "AGENTS.md"),
    FABLE_OUS_CODEX_CONFIG_PATH: join(root, "explicit", "config.toml"),
    FABLE_OUS_CONFIG_DIR: join(root, "explicit", "state")
  };

  const style = ensureCodexStyleLayer({ env });
  const preferences = ensureNativeCodexPreferences({ env });
  assert.equal(style.agentsPath, env.FABLE_OUS_AGENTS_PATH);
  assert.equal(preferences.codexConfigPath, env.FABLE_OUS_CODEX_CONFIG_PATH);
  assert.equal(preferences.configDir, env.FABLE_OUS_CONFIG_DIR);
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
    /warm[^\n]*plain|plain[^\n]*warm/i,
    /completeness and clarity matter more than shortness/i,
    /wording and presentation only/i,
    /neither selects work nor changes/i,
    /user-visible handoff/i,
    /without forcing a follow-up/i,
    /what changed for the user and why it matters/i,
    /concrete evidence/i,
    /without creating or relaxing completion criteria/i,
    /one exact next action only when something remains/i,
    /when installed or customer behavior is part of the outcome/i,
    /does not replace or override/i
  ]) {
    assert.match(MANAGED_CODEX_CONTRACT, pattern);
    assert.match(claudeStyle, pattern);
  }
  assert.match(claudeStyle, /keep-coding-instructions:\s*true/i);
  assert.match(claudeStyle, /force-for-plugin:\s*true/i);
  assert.doesNotMatch(MANAGED_CODEX_CONTRACT, /do the inspection|do all necessary work|never reduce necessary work|likely intent/i);
  assert.doesNotMatch(claudeStyle, /do the inspection|do all necessary work|never reduce necessary work|likely intent/i);
});
