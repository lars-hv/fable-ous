import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  claudeEnablePlan,
  claudeInstallPlan,
  claudePluginEnabled,
  commandPath,
  commandExists,
  windowsCommandPlan,
  parseArgs
} from "../src/cli.mjs";
import {
  ensureCodexStyleLayer,
  ensureNativeCodexPreferences,
  MANAGED_CODEX_CONTRACT,
  MANAGED_BLOCK_END,
  MANAGED_BLOCK_START
} from "../plugins/fable-ous/scripts/activation.mjs";

const ROOT = new URL("../", import.meta.url);
const SOURCE_PLUGIN_ROOT = fileURLToPath(new URL("../plugins/fable-ous", import.meta.url));
const SOURCE_ROOT = fileURLToPath(ROOT);
const CODEX_PLUGIN = JSON.parse(readFileSync(new URL("../plugins/fable-ous/.codex-plugin/plugin.json", import.meta.url), "utf8"));

function installCodexArtifact(codexHome, {
  version = CODEX_PLUGIN.version,
  hooks = false,
  replacementClient = false,
  sourcePath = SOURCE_PLUGIN_ROOT
} = {}) {
  const artifact = join(codexHome, "plugins", "cache", "fable-ous", "fable-ous", version);
  cpSync(SOURCE_PLUGIN_ROOT, artifact, { recursive: true });
  const manifestPath = join(artifact, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== version) {
    manifest.version = version;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  if (hooks) {
    mkdirSync(join(artifact, "hooks"), { recursive: true });
    writeFileSync(join(artifact, "hooks", "hooks.json"), '{"hooks":{}}\n');
  }
  if (replacementClient) {
    mkdirSync(join(artifact, "src"), { recursive: true });
    writeFileSync(join(artifact, "src", "strict.mjs"), "export const legacy = true;\n");
  }
  return {
    artifact,
    entry: {
      pluginId: "fable-ous@fable-ous",
      name: "fable-ous",
      marketplaceName: "fable-ous",
      version,
      installed: true,
      enabled: true,
      source: { source: "local", path: sourcePath },
      marketplaceSource: { sourceType: "local", source: SOURCE_ROOT }
    }
  };
}

function installClaudeArtifact(root, {
  version = "0.2.6",
  hooks = false,
  replacementClient = false,
  unexpectedCapability = false
} = {}) {
  const artifact = join(root, "plugins", "cache", "fable-ous", "fable-ous", version);
  cpSync(SOURCE_PLUGIN_ROOT, artifact, { recursive: true });
  const manifestPath = join(artifact, ".claude-plugin", "plugin.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== version) {
    manifest.version = version;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  if (hooks) {
    mkdirSync(join(artifact, "hooks"), { recursive: true });
    writeFileSync(join(artifact, "hooks", "hooks.json"), '{"hooks":{}}\n');
  }
  if (replacementClient) {
    mkdirSync(join(artifact, "src"), { recursive: true });
    writeFileSync(join(artifact, "src", "strict.mjs"), "export const legacy = true;\n");
  }
  if (unexpectedCapability) {
    mkdirSync(join(artifact, "commands"), { recursive: true });
    writeFileSync(join(artifact, "commands", "legacy.md"), "Unexpected command capability.\n");
  }
  return {
    id: "fable-ous@fable-ous",
    version,
    scope: "user",
    enabled: true,
    installPath: artifact
  };
}

function writeNativeDoctorState(codexHome) {
  mkdirSync(join(codexHome, "fable-ous"), { recursive: true });
  writeFileSync(join(codexHome, "config.toml"), 'personality = "friendly"\nhide_agent_reasoning = true\n');
  ensureCodexStyleLayer({ env: { CODEX_HOME: codexHome } });
  ensureNativeCodexPreferences({ env: { CODEX_HOME: codexHome } });
}

function writePluginListCommand(path, payload) {
  writeFileSync(path, `#!/bin/sh
printf '%s\\n' '${JSON.stringify(payload)}'
`);
  chmodSync(path, 0o700);
}

function writeCodexInstallCommand(path, payload, beforeCommand = "") {
  writeFileSync(path, `#!/bin/sh
${beforeCommand}
if [ "$1 $2 $3" = "plugin list --json" ]; then
  printf '%s\\n' '${JSON.stringify(payload)}'
fi
exit 0
`);
  chmodSync(path, 0o700);
}

function runRejectedCodexInstallPreflight({ agentsContent, configContent, styleMarkerContent, nativeMarkerContent }) {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-owner-preflight-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const invocationLog = join(root, "codex-invoked.log");
  const agentsPath = join(codexHome, "AGENTS.md");
  const configPath = join(codexHome, "config.toml");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(join(bin, "codex"), `#!/bin/sh
printf invoked >> '${invocationLog}'
exit 0
`);
  chmodSync(join(bin, "codex"), 0o700);
  if (agentsContent !== undefined) writeFileSync(agentsPath, agentsContent);
  if (configContent !== undefined) writeFileSync(configPath, configContent);
  if (styleMarkerContent !== undefined) {
    mkdirSync(join(codexHome, "fable-ous"), { recursive: true });
    writeFileSync(join(codexHome, "fable-ous", "standard.json"), styleMarkerContent);
  }
  if (nativeMarkerContent !== undefined) {
    mkdirSync(join(codexHome, "fable-ous"), { recursive: true });
    writeFileSync(join(codexHome, "fable-ous", "native-preferences.json"), nativeMarkerContent);
  }
  const watched = [
    agentsPath,
    configPath,
    join(codexHome, "fable-ous", "standard.json"),
    join(codexHome, "fable-ous", "native-preferences.json")
  ].filter((path) => existsSync(path));
  const before = watched.map((path) => readFileSync(path));

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"],
    { encoding: "utf8", env: { ...process.env, PATH: bin, CODEX_HOME: codexHome } }
  );

  return { before, invocationLog, result, watched };
}

test("public CLI presents Fable-ous as a native Codex plugin", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "help"], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Codex plugin/i);
  assert.match(result.stdout, /fable-ous install/);
  assert.match(result.stdout, /run codex/i);
  assert.doesNotMatch(result.stdout, /Focus Mode|fable-ous focus|fable-ous strict|fable-ous ask/i);
});

test("the default CLI route explains the plugin instead of replacing Codex", () => {
  assert.equal(parseArgs([]).command, "help");
  assert.equal(parseArgs(["install"]).command, "install");
});

test("public onboarding keeps ordinary Codex as the product entrypoint", () => {
  const readme = readFileSync(new URL("README.md", ROOT), "utf8");

  assert.match(readme, /npm install --global github:lars-hv\/fable-ous/);
  assert.match(readme, /npm package is not published yet/i);
  assert.match(readme, /\bcodex\b/);
  assert.match(readme, /native Codex/i);
  assert.doesNotMatch(readme, /Focus Mode|official Codex SDK|fable-ous strict|fable-ous ask/i);
  assert.match(readme, /intended to change communication|designed to change communication/i);
  assert.match(readme, /probabilistic/i);
  assert.match(readme, /does not claim to improve code quality|no code-quality claim/i);
  assert.match(readme, /voice-status/i);
});

test("npm metadata is publishable and contains no replacement Codex runtime", () => {
  const packageJson = JSON.parse(readFileSync(new URL("package.json", ROOT), "utf8"));

  assert.equal(packageJson.version, "0.2.6");
  assert.notEqual(packageJson.private, true);
  assert.equal(packageJson.bin["fable-ous"], "bin/fable-ous.mjs");
  assert.equal(packageJson.dependencies?.["@openai/codex-sdk"], undefined);
  assert.equal(existsSync(new URL("src/strict.mjs", ROOT)), false);
  assert.match(packageJson.scripts.prepublishOnly, /npm run check/);
  assert.match(packageJson.scripts.prepublishOnly, /validate:plugins/);
  assert.match(packageJson.scripts.prepublishOnly, /check:package/);
});

test("portable plugin metadata stays version-aligned and hook-free", () => {
  const packageJson = JSON.parse(readFileSync(new URL("package.json", ROOT), "utf8"));
  const codexPlugin = JSON.parse(readFileSync(new URL("plugins/fable-ous/.codex-plugin/plugin.json", ROOT), "utf8"));
  const claudePlugin = JSON.parse(readFileSync(new URL("plugins/fable-ous/.claude-plugin/plugin.json", ROOT), "utf8"));
  const claudeMarketplace = JSON.parse(readFileSync(new URL(".claude-plugin/marketplace.json", ROOT), "utf8"));
  const codexMarketplace = JSON.parse(readFileSync(new URL(".agents/plugins/marketplace.json", ROOT), "utf8"));

  assert.match(codexPlugin.version, new RegExp(`^${packageJson.version.replaceAll(".", "\\.")}\\+codex\\.`));
  assert.equal(claudePlugin.version, packageJson.version);
  assert.equal(claudeMarketplace.plugins[0].version, packageJson.version);
  assert.equal(codexMarketplace.plugins[0].name, codexPlugin.name);
  assert.equal(existsSync(new URL("plugins/fable-ous/hooks/hooks.json", ROOT)), false);
  assert.equal(existsSync(new URL("plugins/fable-ous/scripts/hook.mjs", ROOT)), false);
});

test("Claude upgrade uses update for an existing Fable-ous installation", () => {
  const installed = JSON.stringify([{ id: "fable-ous@fable-ous", scope: "user", version: "0.2.0" }]);
  assert.deepEqual(
    claudeInstallPlan(installed),
    ["plugin", "update", "fable-ous@fable-ous", "--scope", "user"]
  );
});

test("Claude first install uses install", () => {
  assert.deepEqual(
    claudeInstallPlan("[]"),
    ["plugin", "install", "fable-ous@fable-ous", "--scope", "user"]
  );
});

test("Claude install planning rejects malformed or non-list plugin JSON", () => {
  for (const invalid of ["", "{", "{}", '"fable-ous"']) {
    assert.throws(() => claudeInstallPlan(invalid), /Claude plugin list.*JSON|array/i);
  }
});

test("Claude status requires the exact enabled plugin instead of a text match", () => {
  assert.equal(claudePluginEnabled(JSON.stringify([
    { id: "fable-ous@fable-ous", scope: "user", enabled: true }
  ])), true);
  assert.equal(claudePluginEnabled(JSON.stringify([
    { id: "fable-ous@fable-ous", scope: "user", enabled: false },
    { id: "another@market", description: "mentions fable-ous" }
  ])), false);
  assert.throws(() => claudePluginEnabled("not-json"), /Claude plugin list.*JSON/i);
});

test("Claude ignores unrelated project installs when planning and reporting user status", () => {
  const projectOnly = JSON.stringify([{
    id: "fable-ous@fable-ous",
    scope: "project",
    projectPath: "/example/unrelated-project",
    enabled: true
  }]);

  assert.equal(claudePluginEnabled(projectOnly), false);
  assert.deepEqual(
    claudeInstallPlan(projectOnly),
    ["plugin", "install", "fable-ous@fable-ous", "--scope", "user"]
  );
  assert.equal(claudeEnablePlan(projectOnly), null);
});

test("Claude explicitly enables a disabled user installation after updating it", () => {
  const disabledUser = JSON.stringify([{
    id: "fable-ous@fable-ous",
    scope: "user",
    enabled: false
  }]);

  assert.deepEqual(
    claudeInstallPlan(disabledUser),
    ["plugin", "update", "fable-ous@fable-ous", "--scope", "user"]
  );
  assert.deepEqual(
    claudeEnablePlan(disabledUser),
    ["plugin", "enable", "fable-ous@fable-ous", "--scope", "user"]
  );
});

test("Claude rechecks post-install state and enables a newly installed disabled user plugin", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-claude-post-state-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const claudeHome = join(root, "claude-home");
  const calls = join(root, "claude-calls.log");
  const lists = join(root, "claude-list-count");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  const { entry: codexEntry } = installCodexArtifact(codexHome);
  const claudeArtifact = installClaudeArtifact(claudeHome);
  const disabledClaude = JSON.stringify([{ ...claudeArtifact, enabled: false }]);
  const enabledClaude = JSON.stringify([{ ...claudeArtifact, enabled: true }]);
  for (const command of ["codex", "claude"]) {
    const executable = join(bin, command);
    if (command === "codex") {
      writeCodexInstallCommand(executable, { installed: [codexEntry] });
      continue;
    }
    writeFileSync(executable, `#!/bin/sh
printf '%s\\n' "$*" >> '${calls}'
if [ "$1 $2 $3" = "plugin list --json" ]; then
  count=0
  [ -f '${lists}' ] && count=$(/bin/cat '${lists}')
  count=$((count + 1))
  printf '%s' "$count" > '${lists}'
  if [ "$count" -eq 1 ]; then
    printf '%s\\n' '[]'
  elif [ "$count" -eq 2 ]; then
    printf '%s\\n' '${disabledClaude}'
  else
    printf '%s\\n' '${enabledClaude}'
  fi
fi
exit 0
`);
    chmodSync(executable, 0o700);
  }

  const result = spawnSync(process.execPath, [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install"], {
    encoding: "utf8",
    env: { ...process.env, PATH: bin, CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeHome }
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(readFileSync(calls, "utf8"), /plugin enable fable-ous@fable-ous --scope user/);
});

test("Claude install stops before install or update when plugin-list JSON is malformed", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-claude-malformed-list-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const calls = join(root, "claude-calls.log");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  const { entry } = installCodexArtifact(codexHome);
  writeCodexInstallCommand(join(bin, "codex"), { installed: [entry] });
  writeFileSync(join(bin, "claude"), `#!/bin/sh
printf '%s\\n' "$*" >> '${calls}'
if [ "$1 $2 $3" = "plugin list --json" ]; then
  printf '%s\\n' '{broken'
fi
exit 0
`);
  chmodSync(join(bin, "claude"), 0o700);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install"],
    { encoding: "utf8", env: { ...process.env, PATH: bin, CODEX_HOME: codexHome } }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /Claude plugin list.*JSON/i);
  assert.doesNotMatch(readFileSync(calls, "utf8"), /^plugin (?:install|update|enable) /m);
});

test("command discovery uses PATH directly and does not require sh", {
  skip: process.platform === "win32",
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-path-"));
  const executable = join(root, "codex");
  writeFileSync(executable, "#!/bin/false\n");
  chmodSync(executable, 0o700);

  assert.equal(commandExists("codex", { env: { PATH: root }, platform: "linux" }), true);
  assert.equal(commandExists("claude", { env: { PATH: root }, platform: "linux" }), false);
  assert.doesNotMatch(readFileSync(new URL("../src/cli.mjs", import.meta.url), "utf8"), /spawnSync\(["']sh["']/);
});

test("command discovery honors Windows Path and PATHEXT deterministically", () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-windows-path-"));
  const second = join(root, "second");
  mkdirSync(second);
  const shim = join(second, "codex.CMD");
  writeFileSync(shim, "@echo off\r\nexit /b 0\r\n");

  const env = { Path: `${root};${second}`, PATHEXT: ".EXE;.CMD;.BAT" };
  assert.equal(commandExists("codex", { env, platform: "win32" }), true);
  assert.equal(commandPath("codex", { env, platform: "win32" }), shim);
  assert.equal(commandExists("claude", { env, platform: "win32" }), false);
});

test("Windows command shims use an explicitly quoted ComSpec plan", () => {
  const plan = windowsCommandPlan(
    "C:\\Users\\First Last\\AppData\\Roaming\\npm\\codex.CMD",
    ["plugin", "marketplace", "add", "C:\\Work Space\\fable-ous"],
    { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
  );
  assert.equal(plan.command, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(plan.args.slice(0, 3), ["/d", "/s", "/c"]);
  assert.equal(plan.args[3], '""C:\\Users\\First Last\\AppData\\Roaming\\npm\\codex.CMD" "plugin" "marketplace" "add" "C:\\Work Space\\fable-ous""');
  assert.deepEqual(plan.spawnOptions, {
    shell: false,
    windowsVerbatimArguments: true
  });
  assert.doesNotThrow(() => windowsCommandPlan(
    "C:\\Program Files (x86)\\npm\\codex.cmd",
    ["plugin", "add", "C:\\Work (Preview)\\fable-ous"],
    { ComSpec: "C:\\Windows\\System32\\cmd.exe" }
  ));
});

test("install refuses to change Codex communication files when the added plugin is not active", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-unbound-codex-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  writePluginListCommand(join(bin, "codex"), { installed: [] });

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: bin, CODEX_HOME: codexHome }
    }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /Codex did not bind.*expected Fable-ous release/i);
  assert.equal(existsSync(join(codexHome, "AGENTS.md")), false);
  assert.equal(existsSync(join(codexHome, "config.toml")), false);
});

test("public install fails before host mutation for unsafe owner-controlled communication files", {
  skip: process.platform === "win32"
}, () => {
  const cases = [
    {
      name: "non-UTF-8 AGENTS bytes",
      agentsContent: Buffer.from([0xff, 0x23, 0x20, 0x72, 0x75, 0x6c, 0x65])
    },
    {
      name: "non-UTF-8 config bytes",
      configContent: Buffer.from([0xff, 0x70, 0x65, 0x72, 0x73, 0x6f, 0x6e, 0x61, 0x6c, 0x69, 0x74, 0x79])
    },
    {
      name: "UTF-8 BOM config bytes",
      configContent: Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('personality = "pragmatic"\n')
      ])
    },
    {
      name: "personality table conflict",
      configContent: "[personality]\nvoice = 'calm'\n"
    },
    {
      name: "quoted reasoning table conflict",
      configContent: "['hide_agent_reasoning']\nenabled = true\n"
    },
    {
      name: "managed table conflict after an unrelated table",
      configContent: "[features]\nplugins = true\n\n[personality]\nvoice = 'calm'\n"
    },
    {
      name: "fenced unowned marker example",
      agentsContent: `# Documentation\n\n\`\`\`markdown\n${MANAGED_CODEX_CONTRACT}\n\`\`\`\n`
    },
    {
      name: "unclosed Markdown fence",
      agentsContent: "# Owner rules\n\n```markdown\nexample still open\n"
    }
  ];

  for (const testCase of cases) {
    const { before, invocationLog, result, watched } = runRejectedCodexInstallPreflight(testCase);

    assert.notEqual(result.status, 0, testCase.name);
    assert.match(
      result.stderr,
      /UTF-8|BOM|byte-order mark|conflicting TOML table|unowned Fable-ous marker|open Markdown fence/i,
      testCase.name
    );
    assert.deepEqual(watched.map((path) => readFileSync(path)), before, testCase.name);
    assert.equal(existsSync(invocationLog), false, `${testCase.name}: Codex was invoked`);
  }
});

test("public install rejects colliding AGENTS and Codex config paths before host mutation", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-path-collision-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const invocationLog = join(root, "codex-invoked.log");
  const configPath = join(codexHome, "config.toml");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(join(bin, "codex"), `#!/bin/sh
printf invoked >> '${invocationLog}'
exit 0
`);
  chmodSync(join(bin, "codex"), 0o700);
  const original = 'personality = "pragmatic"\n';
  writeFileSync(configPath, original);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: bin,
        CODEX_HOME: codexHome,
        FABLE_OUS_AGENTS_PATH: configPath
      }
    }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /distinct|same managed path|path collision/i);
  assert.equal(readFileSync(configPath, "utf8"), original);
  assert.equal(existsSync(invocationLog), false, "Codex was invoked before the path preflight failed");
  assert.equal(existsSync(join(codexHome, "fable-ous")), false);
});

test("public install rejects distinct managed paths sharing one inode before host mutation", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-inode-collision-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const invocationLog = join(root, "codex-invoked.log");
  const agentsPath = join(codexHome, "AGENTS.md");
  const configPath = join(codexHome, "config.toml");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(join(bin, "codex"), `#!/bin/sh
printf invoked >> '${invocationLog}'
exit 0
`);
  chmodSync(join(bin, "codex"), 0o700);
  const original = Buffer.from("# Owner-controlled bytes\n");
  writeFileSync(agentsPath, original);
  linkSync(agentsPath, configPath);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"],
    { encoding: "utf8", env: { ...process.env, PATH: bin, CODEX_HOME: codexHome } }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /same managed inode|share.*inode/i);
  assert.deepEqual(readFileSync(agentsPath), original);
  assert.deepEqual(readFileSync(configPath), original);
  assert.equal(existsSync(invocationLog), false, "Codex was invoked before the inode preflight failed");
  assert.equal(existsSync(join(codexHome, "fable-ous")), false);
});

test("public install rejects absent aliases through symlinked parents before host mutation", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-parent-alias-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const realParent = join(root, "real");
  const aliasParent = join(root, "alias");
  const invocationLog = join(root, "codex-invoked.log");
  mkdirSync(bin);
  mkdirSync(realParent);
  symlinkSync(realParent, aliasParent);
  const { entry } = installCodexArtifact(codexHome);
  writeCodexInstallCommand(join(bin, "codex"), { installed: [entry] }, `
printf invoked >> '${invocationLog}'
`);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: bin,
        CODEX_HOME: codexHome,
        FABLE_OUS_AGENTS_PATH: join(realParent, "shared"),
        FABLE_OUS_CODEX_CONFIG_PATH: join(aliasParent, "shared")
      }
    }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /distinct|same managed path|path collision|alias/i);
  assert.equal(existsSync(invocationLog), false, "Codex was invoked before canonical path preflight failed");
  assert.equal(existsSync(join(realParent, "shared")), false);
});

test("public install and style-off reject a stale legacy marker beside a fenced user example", {
  skip: process.platform === "win32"
}, () => {
  const staleMarker = '{"schema":1,"source":"managed"}\n';
  const examples = [
    {
      name: "fenced historical example",
      content: `# Historical documentation\n\n\`\`\`markdown\n\n<!-- fable-ous:codex-style:boundary -->\n${MANAGED_CODEX_CONTRACT}\n\`\`\`\n`
    },
    {
      name: "marker example at byte zero",
      content: `${MANAGED_CODEX_CONTRACT}\n`
    },
    {
      name: "unbound legacy boundary outside a fence",
      content: `# Owner documentation\n\n<!-- fable-ous:codex-style:boundary -->\n${MANAGED_BLOCK_START}\nUser-owned historical example.\n${MANAGED_BLOCK_END}\n`
    }
  ];

  for (const example of examples) {
    const install = runRejectedCodexInstallPreflight({
      agentsContent: example.content,
      styleMarkerContent: staleMarker
    });

    assert.notEqual(install.result.status, 0, example.name);
    assert.match(install.result.stderr, /ownership|bound|unowned|cannot safely/i, example.name);
    assert.deepEqual(install.watched.map((path) => readFileSync(path)), install.before, example.name);
    assert.equal(existsSync(install.invocationLog), false, `${example.name}: Codex was invoked`);

    const root = mkdtempSync(join(tmpdir(), "fable-ous-style-off-stale-marker-"));
    const codexHome = join(root, "codex-home");
    const configDir = join(codexHome, "fable-ous");
    const agentsPath = join(codexHome, "AGENTS.md");
    const markerPath = join(configDir, "standard.json");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(agentsPath, example.content);
    writeFileSync(markerPath, staleMarker);
    const before = [readFileSync(agentsPath), readFileSync(markerPath)];

    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "style-off"],
      { encoding: "utf8", env: { ...process.env, CODEX_HOME: codexHome } }
    );

    assert.notEqual(result.status, 0, example.name);
    assert.match(result.stderr, /ownership|bound|unowned|cannot safely/i, example.name);
    assert.deepEqual([readFileSync(agentsPath), readFileSync(markerPath)], before, example.name);
  }
});

test("style-off fails before changing any communication file when rollback evidence is corrupt", () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-style-off-preflight-"));
  const codexHome = join(root, "codex-home");
  const env = { CODEX_HOME: codexHome };
  ensureNativeCodexPreferences({ env });
  ensureCodexStyleLayer({ env });
  const paths = [
    join(codexHome, "AGENTS.md"),
    join(codexHome, "config.toml"),
    join(codexHome, "fable-ous", "standard.json"),
    join(codexHome, "fable-ous", "native-preferences.json")
  ];
  writeFileSync(paths[3], '{"schema":1,"original":{}}\n');
  const before = paths.map((path) => readFileSync(path, "utf8"));

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "style-off"],
    { encoding: "utf8", env: { ...process.env, CODEX_HOME: codexHome } }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /invalid rollback marker|cannot safely/i);
  assert.deepEqual(paths.map((path) => readFileSync(path, "utf8")), before);
});

test("public style-off fails closed when native preference rollback evidence is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-style-off-missing-native-marker-"));
  const codexHome = join(root, "codex-home");
  const env = { CODEX_HOME: codexHome };
  ensureNativeCodexPreferences({ env });
  ensureCodexStyleLayer({ env });
  const agentsPath = join(codexHome, "AGENTS.md");
  const configPath = join(codexHome, "config.toml");
  const styleMarkerPath = join(codexHome, "fable-ous", "standard.json");
  const nativeMarkerPath = join(codexHome, "fable-ous", "native-preferences.json");
  rmSync(nativeMarkerPath);
  const before = [agentsPath, configPath, styleMarkerPath].map((path) => readFileSync(path));

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "style-off"],
    { encoding: "utf8", env: { ...process.env, CODEX_HOME: codexHome } }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /rollback evidence|native preferences|cannot safely restore/i);
  assert.doesNotMatch(result.stdout, /restored its managed Codex communication settings/i);
  assert.deepEqual(
    [agentsPath, configPath, styleMarkerPath].map((path) => readFileSync(path)),
    before
  );
  assert.equal(existsSync(nativeMarkerPath), false);
});

test("public style-off rejects rollback markers from another target", () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-style-off-target-binding-"));
  const codexHome = join(root, "codex-home");
  const env = { CODEX_HOME: codexHome };
  ensureNativeCodexPreferences({ env });
  ensureCodexStyleLayer({ env });
  const secondAgents = join(root, "second-AGENTS.md");
  const secondConfig = join(root, "second-config.toml");
  writeFileSync(secondAgents, "# Second owner file\n");
  writeFileSync(secondConfig, 'personality = "friendly"\nhide_agent_reasoning = true\nowner_value = 7\n');
  const watched = [
    join(codexHome, "AGENTS.md"),
    join(codexHome, "config.toml"),
    join(codexHome, "fable-ous", "standard.json"),
    join(codexHome, "fable-ous", "native-preferences.json"),
    secondAgents,
    secondConfig
  ];
  const before = watched.map((path) => readFileSync(path));

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "style-off"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CODEX_HOME: codexHome,
        FABLE_OUS_AGENTS_PATH: secondAgents,
        FABLE_OUS_CODEX_CONFIG_PATH: secondConfig
      }
    }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /target|binding|rollback evidence|cannot safely/i);
  assert.deepEqual(watched.map((path) => readFileSync(path)), before);
  assert.doesNotMatch(result.stdout, /restored its managed Codex communication settings/i);
});

test("public style-off rejects a schema-1 native marker copied from another Codex home", () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-style-off-legacy-target-"));
  const codexHome = join(root, "home-b");
  const configDir = join(codexHome, "fable-ous");
  const configPath = join(codexHome, "config.toml");
  mkdirSync(configDir, { recursive: true });
  const ownerConfig = 'personality = "friendly"\nhide_agent_reasoning = true\nowner_home = "b"\n';
  writeFileSync(configPath, ownerConfig);
  writeFileSync(join(configDir, "native-preferences.json"), `${JSON.stringify({
    schema: 1,
    original: {
      personality: { present: true, line: 'personality = "none"' },
      hide_agent_reasoning: { present: false }
    }
  })}\n`);
  const markerBefore = readFileSync(join(configDir, "native-preferences.json"));

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "style-off"],
    { encoding: "utf8", env: { ...process.env, CODEX_HOME: codexHome } }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /legacy|target|binding|rollback evidence|cannot safely/i);
  assert.equal(readFileSync(configPath, "utf8"), ownerConfig);
  assert.deepEqual(readFileSync(join(configDir, "native-preferences.json")), markerBefore);
  assert.doesNotMatch(result.stdout, /restored its managed Codex communication settings/i);
});

test("public install rejects an unbound schema-1 native marker before host mutation", () => {
  const marker = `${JSON.stringify({
    schema: 1,
    original: {
      personality: { present: true, line: 'personality = "none"' },
      hide_agent_reasoning: { present: false }
    }
  })}\n`;
  const install = runRejectedCodexInstallPreflight({
    configContent: 'personality = "friendly"\nhide_agent_reasoning = true\nowner_home = "b"\n',
    nativeMarkerContent: marker
  });

  assert.notEqual(install.result.status, 0, `${install.result.stdout}\n${install.result.stderr}`);
  assert.match(install.result.stderr, /legacy|unbound|migrate|cannot safely/i);
  assert.deepEqual(install.watched.map((path) => readFileSync(path)), install.before);
  assert.equal(existsSync(install.invocationLog), false, "Codex was invoked before legacy ownership failed");
});

test("public style-off fails closed when the style ownership marker is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-style-off-missing-style-marker-"));
  const codexHome = join(root, "codex-home");
  const env = { CODEX_HOME: codexHome };
  ensureNativeCodexPreferences({ env });
  ensureCodexStyleLayer({ env });
  const agentsPath = join(codexHome, "AGENTS.md");
  const configPath = join(codexHome, "config.toml");
  const nativeMarkerPath = join(codexHome, "fable-ous", "native-preferences.json");
  rmSync(join(codexHome, "fable-ous", "standard.json"));
  const before = [agentsPath, configPath, nativeMarkerPath].map((path) => readFileSync(path));

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "style-off"],
    { encoding: "utf8", env: { ...process.env, CODEX_HOME: codexHome } }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /style marker|ownership|bound|cannot safely/i);
  assert.deepEqual([agentsPath, configPath, nativeMarkerPath].map((path) => readFileSync(path)), before);
  assert.doesNotMatch(result.stdout, /restored its managed Codex communication settings/i);
});

test("public style-off refuses an unbound legacy AGENTS marker until install migrates it", () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-style-off-legacy-bytes-"));
  const codexHome = join(root, "codex-home");
  const configDir = join(codexHome, "fable-ous");
  const agentsPath = join(codexHome, "AGENTS.md");
  const backupPath = `${agentsPath}.fable-ous.bak`;
  const original = Buffer.from("# Owner rules without final newline");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(agentsPath, Buffer.concat([
    original,
    Buffer.from(`\n\n${MANAGED_CODEX_CONTRACT}\n`)
  ]));
  writeFileSync(backupPath, original);
  writeFileSync(join(configDir, "standard.json"), '{"schema":1,"source":"managed"}\n');
  const before = [agentsPath, backupPath, join(configDir, "standard.json")]
    .map((path) => readFileSync(path));

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "style-off"],
    { encoding: "utf8", env: { ...process.env, CODEX_HOME: codexHome } }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /legacy|install once|migrate|cannot safely/i);
  assert.deepEqual(
    [agentsPath, backupPath, join(configDir, "standard.json")].map((path) => readFileSync(path)),
    before
  );
});

test("public install preserves a proven legacy AGENTS rollback backup", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-legacy-backup-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const configDir = join(codexHome, "fable-ous");
  const agentsPath = join(codexHome, "AGENTS.md");
  const backupPath = `${agentsPath}.fable-ous.bak`;
  const original = "# Owner rules\n";
  mkdirSync(bin);
  mkdirSync(configDir, { recursive: true });
  const { entry } = installCodexArtifact(codexHome);
  writePluginListCommand(join(bin, "codex"), { installed: [entry] });
  writeFileSync(agentsPath, `${original.trimEnd()}\n\n${MANAGED_CODEX_CONTRACT}\n`);
  writeFileSync(backupPath, original);
  writeFileSync(join(configDir, "standard.json"), '{"schema":1,"source":"managed"}\n');

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only", "--migrate-legacy"],
    { encoding: "utf8", env: { ...process.env, PATH: bin, CODEX_HOME: codexHome } }
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(readFileSync(backupPath), Buffer.from(original));
});

test("public style-off refuses a fenced user marker example without ownership evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-style-off-unowned-example-"));
  const codexHome = join(root, "codex-home");
  const agentsPath = join(codexHome, "AGENTS.md");
  const original = `# Documentation\n\n\`\`\`markdown\n${MANAGED_CODEX_CONTRACT}\n\`\`\`\n`;
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(agentsPath, original);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "style-off"],
    { encoding: "utf8", env: { ...process.env, CODEX_HOME: codexHome } }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /unowned|marker|ownership|cannot safely/i);
  assert.equal(readFileSync(agentsPath, "utf8"), original);
});

test("public style-off fails closed on non-UTF-8 AGENTS and config bytes", () => {
  for (const target of ["AGENTS.md", "config.toml"]) {
    const root = mkdtempSync(join(tmpdir(), "fable-ous-style-off-non-utf8-"));
    const codexHome = join(root, "codex-home");
    const configDir = join(codexHome, "fable-ous");
    mkdirSync(configDir, { recursive: true });
    ensureCodexStyleLayer({ env: { CODEX_HOME: codexHome } });
    writeFileSync(join(codexHome, "config.toml"), 'personality = "friendly"\nhide_agent_reasoning = true\n');
    writeFileSync(join(configDir, "native-preferences.json"), `${JSON.stringify({
      schema: 1,
      original: {
        personality: { present: false },
        hide_agent_reasoning: { present: false }
      }
    })}\n`);
    const targetPath = join(codexHome, target);
    const invalid = Buffer.concat([Buffer.from([0xff]), readFileSync(targetPath)]);
    writeFileSync(targetPath, invalid);
    const watched = [
      join(codexHome, "AGENTS.md"),
      join(codexHome, "config.toml"),
      join(configDir, "standard.json"),
      join(configDir, "native-preferences.json")
    ];
    const before = watched.map((path) => readFileSync(path));

    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "style-off"],
      { encoding: "utf8", env: { ...process.env, CODEX_HOME: codexHome } }
    );

    assert.notEqual(result.status, 0, target);
    assert.match(result.stderr, /UTF-8|safely read/i, target);
    assert.deepEqual(watched.map((path) => readFileSync(path)), before, target);
  }
});

test("public style-off preserves a valid UTF-8 byte-order mark", () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-style-off-utf8-bom-"));
  const codexHome = join(root, "codex-home");
  const configDir = join(codexHome, "fable-ous");
  const agentsPath = join(codexHome, "AGENTS.md");
  const expected = Buffer.from([0xef, 0xbb, 0xbf]);
  mkdirSync(configDir, { recursive: true });
  writeFileSync(agentsPath, expected);
  ensureCodexStyleLayer({ env: { CODEX_HOME: codexHome } });

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "style-off"],
    { encoding: "utf8", env: { ...process.env, CODEX_HOME: codexHome } }
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(readFileSync(agentsPath), expected);
});

test("public style-off rejects managed names used as TOML tables without changing any file", () => {
  for (const config of ["[personality]\nvoice = 'calm'\n", "['hide_agent_reasoning']\nenabled = true\n"]) {
    const root = mkdtempSync(join(tmpdir(), "fable-ous-style-off-table-conflict-"));
    const codexHome = join(root, "codex-home");
    const configDir = join(codexHome, "fable-ous");
    mkdirSync(configDir, { recursive: true });
    ensureCodexStyleLayer({ env: { CODEX_HOME: codexHome } });
    writeFileSync(join(codexHome, "config.toml"), config);
    writeFileSync(join(configDir, "native-preferences.json"), `${JSON.stringify({
      schema: 1,
      original: {
        personality: { present: false },
        hide_agent_reasoning: { present: false }
      }
    })}\n`);
    const watched = [
      join(codexHome, "AGENTS.md"),
      join(codexHome, "config.toml"),
      join(configDir, "standard.json"),
      join(configDir, "native-preferences.json")
    ];
    const before = watched.map((path) => readFileSync(path));

    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "style-off"],
      { encoding: "utf8", env: { ...process.env, CODEX_HOME: codexHome } }
    );

    assert.notEqual(result.status, 0, config);
    assert.match(result.stderr, /conflicting TOML table|cannot safely/i, config);
    assert.deepEqual(watched.map((path) => readFileSync(path)), before, config);
  }
});

test("style-off fails before mutation when its managed marker is not a regular file", () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-style-off-marker-type-"));
  const codexHome = join(root, "codex-home");
  const env = { CODEX_HOME: codexHome };
  ensureNativeCodexPreferences({ env });
  ensureCodexStyleLayer({ env });
  const paths = [
    join(codexHome, "AGENTS.md"),
    join(codexHome, "config.toml"),
    join(codexHome, "fable-ous", "native-preferences.json")
  ];
  const markerPath = join(codexHome, "fable-ous", "standard.json");
  rmSync(markerPath);
  mkdirSync(markerPath);
  const before = paths.map((path) => readFileSync(path, "utf8"));

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "style-off"],
    { encoding: "utf8", env: { ...process.env, CODEX_HOME: codexHome } }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /regular file/i);
  assert.deepEqual(paths.map((path) => readFileSync(path, "utf8")), before);
  assert.equal(existsSync(markerPath), true);
});

test("style-off restores all four owned paths when a separate AGENTS parent is unwritable", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-style-off-cross-layer-"));
  const codexHome = join(root, "codex-home");
  const agentsDir = join(root, "separate-agents");
  const agentsPath = join(agentsDir, "AGENTS.md");
  const env = { CODEX_HOME: codexHome, FABLE_OUS_AGENTS_PATH: agentsPath };
  mkdirSync(agentsDir);
  ensureNativeCodexPreferences({ env });
  ensureCodexStyleLayer({ env });
  const paths = [
    agentsPath,
    join(codexHome, "config.toml"),
    join(codexHome, "fable-ous", "standard.json"),
    join(codexHome, "fable-ous", "native-preferences.json")
  ];
  const before = paths.map((path) => ({
    content: readFileSync(path),
    mode: lstatSync(path).mode & 0o7777
  }));
  chmodSync(agentsDir, 0o500);
  let result;
  try {
    result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "style-off"],
      { encoding: "utf8", env: { ...process.env, ...env } }
    );
  } finally {
    chmodSync(agentsDir, 0o700);
  }

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /permission denied|EACCES/i);
  const after = paths.map((path) => ({
    content: readFileSync(path),
    mode: lstatSync(path).mode & 0o7777
  }));
  assert.deepEqual(after, before);
});

test("style-off restores AGENTS after a later owned-marker removal failure", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-style-off-late-marker-"));
  const codexHome = join(root, "codex-home");
  const env = { CODEX_HOME: codexHome };
  ensureCodexStyleLayer({ env });
  const agentsPath = join(codexHome, "AGENTS.md");
  const markerPath = join(codexHome, "fable-ous", "standard.json");
  const beforeAgents = readFileSync(agentsPath);
  const beforeMarker = readFileSync(markerPath);
  const configDir = join(codexHome, "fable-ous");
  chmodSync(configDir, 0o500);
  let result;
  try {
    result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "style-off"],
      { encoding: "utf8", env: { ...process.env, ...env } }
    );
  } finally {
    chmodSync(configDir, 0o700);
  }

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /permission denied|EACCES/i);
  assert.deepEqual(readFileSync(agentsPath), beforeAgents);
  assert.deepEqual(readFileSync(markerPath), beforeMarker);
});

test("install rejects a non-file managed marker before host plugin mutation", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-marker-type-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const markerPath = join(codexHome, "fable-ous", "standard.json");
  const hostMutationLog = join(root, "host-plugin-command-ran");
  mkdirSync(bin);
  mkdirSync(markerPath, { recursive: true });
  const fakeCodex = join(bin, "codex");
  writeFileSync(fakeCodex, `#!/bin/sh
printf 'called\\n' >> '${hostMutationLog}'
exit 1
`);
  chmodSync(fakeCodex, 0o700);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"],
    { encoding: "utf8", env: { ...process.env, PATH: bin, CODEX_HOME: codexHome } }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /regular file/i);
  assert.equal(existsSync(hostMutationLog), false);
  assert.equal(existsSync(join(codexHome, "AGENTS.md")), false);
  assert.equal(existsSync(join(codexHome, "config.toml")), false);
});

test("install stops before host mutation when pre-state inspection becomes unsafe", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-prestate-race-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const configPath = join(codexHome, "config.toml");
  const linkedConfig = join(root, "linked-config.toml");
  const hostMutationLog = join(root, "host-plugin-command-ran");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(linkedConfig, 'personality = "pragmatic"\n');
  const fifo = spawnSync("mkfifo", [configPath], { encoding: "utf8" });
  assert.equal(fifo.status, 0, fifo.stderr);
  const writer = spawn("/bin/sh", [
    "-c",
    'exec 3>"$1"; printf \'personality = "pragmatic"\\n\' >&3; rm -f "$1"; ln -s "$2" "$1"; exec 3>&-',
    "fable-ous-race-writer",
    configPath,
    linkedConfig
  ], { stdio: "ignore" });
  writer.unref();
  const fakeCodex = join(bin, "codex");
  writeFileSync(fakeCodex, `#!/bin/sh
printf 'called\\n' >> '${hostMutationLog}'
exit 1
`);
  chmodSync(fakeCodex, 0o700);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: bin, CODEX_HOME: codexHome }
    }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /symbolic link|regular file/i);
  assert.equal(existsSync(hostMutationLog), false);
  assert.equal(readFileSync(linkedConfig, "utf8"), 'personality = "pragmatic"\n');
  assert.equal(existsSync(join(codexHome, "fable-ous")), false);
});

test("predictable config failure is rejected before host plugins or preferences change", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-rollback-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const hostMutationLog = join(root, "host-plugin-command-ran");
  mkdirSync(bin);
  mkdirSync(join(codexHome, "fable-ous"), { recursive: true });
  const fakeCodex = join(bin, "codex");
  writeFileSync(fakeCodex, `#!/bin/sh
printf 'called\\n' >> '${hostMutationLog}'
exit 0
`);
  chmodSync(fakeCodex, 0o700);
  mkdirSync(join(codexHome, "AGENTS.md"));
  writeFileSync(join(codexHome, "fable-ous", "standard.json"), `${JSON.stringify({ schema: 1, source: "managed" })}\n`);
  const configPath = join(codexHome, "config.toml");
  const original = 'personality = "pragmatic"\n';
  writeFileSync(configPath, original);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: bin, CODEX_HOME: codexHome }
    }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(readFileSync(configPath, "utf8"), original);
  assert.equal(existsSync(join(codexHome, "fable-ous", "native-preferences.json")), false);
  assert.equal(existsSync(hostMutationLog), false, "predictable config failure must precede host plugin mutation");
});

test("public install preserves a concurrent config edit made immediately before replacement", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-rename-race-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const configPath = join(codexHome, "config.toml");
  const preloadPath = join(root, "rename-race.cjs");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  const { entry } = installCodexArtifact(codexHome);
  writeCodexInstallCommand(join(bin, "codex"), { installed: [entry] });
  writeFileSync(configPath, 'personality = "pragmatic"\n');
  const concurrent = 'personality = "none"\nowner_edit = true\n';
  writeFileSync(preloadPath, `
const fs = require("node:fs");
const { syncBuiltinESMExports } = require("node:module");
const originalRenameSync = fs.renameSync;
let injected = false;
fs.renameSync = function(source, destination) {
  if (!injected && source === ${JSON.stringify(configPath)}) {
    injected = true;
    fs.writeFileSync(${JSON.stringify(configPath)}, ${JSON.stringify(concurrent)});
  }
  return originalRenameSync(source, destination);
};
syncBuiltinESMExports();
`);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: bin,
        CODEX_HOME: codexHome,
        NODE_OPTIONS: `--require=${preloadPath}`
      }
    }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /concurrent change|changed before/i);
  assert.equal(readFileSync(configPath, "utf8"), concurrent);
  assert.equal(existsSync(join(codexHome, "fable-ous", "native-preferences.json")), false);
});

test("public style-off preserves a concurrent marker replacement made immediately before removal", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-style-off-remove-race-"));
  const codexHome = join(root, "codex-home");
  const env = { CODEX_HOME: codexHome };
  ensureNativeCodexPreferences({ env });
  ensureCodexStyleLayer({ env });
  const agentsPath = join(codexHome, "AGENTS.md");
  const configPath = join(codexHome, "config.toml");
  const styleMarkerPath = join(codexHome, "fable-ous", "standard.json");
  const nativeMarkerPath = join(codexHome, "fable-ous", "native-preferences.json");
  const preloadPath = join(root, "remove-race.cjs");
  const concurrent = "owner replacement marker bytes\n";
  const before = [agentsPath, configPath, styleMarkerPath].map((path) => readFileSync(path));
  writeFileSync(preloadPath, `
const fs = require("node:fs");
const { syncBuiltinESMExports } = require("node:module");
const originalRenameSync = fs.renameSync;
const originalRmSync = fs.rmSync;
let injected = false;
function inject(target) {
  if (!injected && target === ${JSON.stringify(nativeMarkerPath)}) {
    injected = true;
    fs.writeFileSync(${JSON.stringify(nativeMarkerPath)}, ${JSON.stringify(concurrent)});
  }
}
fs.renameSync = function(source, destination) {
  inject(source);
  return originalRenameSync(source, destination);
};
fs.rmSync = function(target, options) {
  inject(target);
  return originalRmSync(target, options);
};
syncBuiltinESMExports();
`);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "style-off"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CODEX_HOME: codexHome,
        NODE_OPTIONS: `--require=${preloadPath}`
      }
    }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /concurrent change|changed before/i);
  assert.equal(readFileSync(nativeMarkerPath, "utf8"), concurrent);
  assert.deepEqual(
    [agentsPath, configPath, styleMarkerPath].map((path) => readFileSync(path)),
    before
  );
  assert.doesNotMatch(result.stdout, /restored its managed Codex communication settings/i);
});

test("install preserves an open-descriptor owner edit after displacement", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-open-descriptor-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const configPath = join(codexHome, "config.toml");
  const preloadPath = join(root, "open-descriptor.cjs");
  const original = 'personality = "pragmatic"\n';
  const ownerToken = "owner-open-descriptor-token\n";
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  const { entry } = installCodexArtifact(codexHome);
  writeCodexInstallCommand(join(bin, "codex"), { installed: [entry] });
  writeFileSync(configPath, original);
  writeFileSync(preloadPath, `
const fs = require("node:fs");
const { syncBuiltinESMExports } = require("node:module");
const descriptor = fs.openSync(${JSON.stringify(configPath)}, "r+");
const originalLinkSync = fs.linkSync;
let injected = false;
fs.linkSync = function(source, destination) {
  const result = originalLinkSync(source, destination);
  if (!injected && destination === ${JSON.stringify(configPath)}) {
    injected = true;
    fs.writeSync(descriptor, ${JSON.stringify(ownerToken)}, 0, "utf8");
  }
  return result;
};
syncBuiltinESMExports();
`);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: bin,
        CODEX_HOME: codexHome,
        NODE_OPTIONS: `--require=${preloadPath}`
      }
    }
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const recoveries = readdirSync(codexHome)
    .filter((name) => name.startsWith("config.toml.fable-ous-displaced-"))
    .map((name) => join(codexHome, name));
  assert.equal(
    recoveries.some((path) => readFileSync(path, "utf8").includes(ownerToken)),
    true,
    "the old inode must retain a pathname after an owner writes through an open descriptor"
  );
  assert.equal(
    recoveries.every((path) => (lstatSync(path).mode & 0o7777) === 0o600),
    true,
    "recovery links containing owner bytes must be private"
  );
});

test("failed install keeps a post-link owner config edit at the canonical path", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-post-link-rollback-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const agentsDir = join(root, "locked-agents");
  const agentsPath = join(agentsDir, "AGENTS.md");
  const configPath = join(codexHome, "config.toml");
  const preloadPath = join(root, "post-link-owner-edit.cjs");
  const ownerConfig = 'personality = "none"\nhide_agent_reasoning = false\nowner_post_link = true\n';
  mkdirSync(bin);
  mkdirSync(agentsDir);
  const { entry } = installCodexArtifact(codexHome);
  writeCodexInstallCommand(join(bin, "codex"), { installed: [entry] });
  writeFileSync(configPath, 'personality = "pragmatic"\n');
  writeFileSync(preloadPath, `
const fs = require("node:fs");
const { syncBuiltinESMExports } = require("node:module");
const originalLinkSync = fs.linkSync;
let injected = false;
fs.linkSync = function(source, destination) {
  const result = originalLinkSync(source, destination);
  if (!injected && destination === ${JSON.stringify(configPath)}) {
    injected = true;
    fs.writeFileSync(${JSON.stringify(configPath)}, ${JSON.stringify(ownerConfig)});
  }
  return result;
};
syncBuiltinESMExports();
`);
  chmodSync(agentsDir, 0o500);
  let result;
  try {
    result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: bin,
          CODEX_HOME: codexHome,
          FABLE_OUS_AGENTS_PATH: agentsPath,
          NODE_OPTIONS: `--require=${preloadPath}`
        }
      }
    );
  } finally {
    chmodSync(agentsDir, 0o700);
  }

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(readFileSync(configPath, "utf8"), ownerConfig);
});

test("public install preserves canonical owner files when hard links are unsupported", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-no-hardlinks-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const configPath = join(codexHome, "config.toml");
  const agentsPath = join(codexHome, "AGENTS.md");
  const preloadPath = join(root, "no-hardlinks.cjs");
  const originalConfig = 'personality = "pragmatic"\n';
  const originalAgents = "# Owner rules\n";
  mkdirSync(bin);
  const { entry } = installCodexArtifact(codexHome);
  writeCodexInstallCommand(join(bin, "codex"), { installed: [entry] });
  writeFileSync(configPath, originalConfig);
  writeFileSync(agentsPath, originalAgents);
  writeFileSync(preloadPath, `
const fs = require("node:fs");
const { syncBuiltinESMExports } = require("node:module");
const originalLinkSync = fs.linkSync;
fs.linkSync = function(source, destination) {
  if (source === ${JSON.stringify(configPath)} || destination === ${JSON.stringify(configPath)}) {
    const error = new Error("hard links unsupported for managed config");
    error.code = "ENOTSUP";
    throw error;
  }
  return originalLinkSync(source, destination);
};
syncBuiltinESMExports();
`);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: bin,
        CODEX_HOME: codexHome,
        NODE_OPTIONS: `--require=${preloadPath}`
      }
    }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(readFileSync(configPath, "utf8"), originalConfig);
  assert.equal(readFileSync(agentsPath, "utf8"), originalAgents);
});

test("public install restores the canonical owner file when hard links fail after displacement", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-post-displacement-link-failure-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const configPath = join(codexHome, "config.toml");
  const preloadPath = join(root, "post-displacement-link-failure.cjs");
  const originalConfig = 'personality = "pragmatic"\nowner_value = 7\n';
  mkdirSync(bin);
  const { entry } = installCodexArtifact(codexHome);
  writeCodexInstallCommand(join(bin, "codex"), { installed: [entry] });
  writeFileSync(configPath, originalConfig);
  writeFileSync(preloadPath, `
const fs = require("node:fs");
const { syncBuiltinESMExports } = require("node:module");
const originalLinkSync = fs.linkSync;
fs.linkSync = function(source, destination) {
  const touchesCanonical = destination === ${JSON.stringify(configPath)};
  if (touchesCanonical && !String(destination).includes(".link-probe")) {
    const error = new Error("one-shot hard-link failure after displacement");
    error.code = "ENOTSUP";
    throw error;
  }
  return originalLinkSync(source, destination);
};
syncBuiltinESMExports();
`);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: bin,
        CODEX_HOME: codexHome,
        NODE_OPTIONS: `--require=${preloadPath}`
      }
    }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(readFileSync(configPath, "utf8"), originalConfig);
  const recoveries = readdirSync(codexHome)
    .filter((name) => name.startsWith("config.toml.fable-ous-displaced-"));
  assert.ok(recoveries.length >= 1, "late open-descriptor bytes retain a private recovery path");
  assert.equal(readFileSync(join(codexHome, recoveries.at(-1)), "utf8"), originalConfig);
});

test("a late filesystem race still rolls back newly applied native preferences", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-late-install-failure-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const hostMutationLog = join(root, "host-plugin-command-ran");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  const fakeCodex = join(bin, "codex");
  const { entry } = installCodexArtifact(codexHome);
  writeCodexInstallCommand(fakeCodex, { installed: [entry] }, `
printf 'called\\n' >> '${hostMutationLog}'
/bin/rm -f "$CODEX_HOME/AGENTS.md"
/bin/mkdir -p "$CODEX_HOME/AGENTS.md"
`);
  const configPath = join(codexHome, "config.toml");
  const original = 'personality = "pragmatic"\n';
  writeFileSync(configPath, original);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: bin, CODEX_HOME: codexHome }
    }
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(existsSync(hostMutationLog), true, "the failure was injected after host plugin commands began");
  assert.equal(readFileSync(configPath, "utf8"), original);
  assert.equal(existsSync(join(codexHome, "fable-ous", "native-preferences.json")), false);
});

test("install restores the exact four-path pre-state when active preferences change before a late style failure", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-cross-layer-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const agentsDir = join(root, "separate-agents");
  const agentsPath = join(agentsDir, "AGENTS.md");
  const raceMarker = join(root, "race-applied");
  const env = { CODEX_HOME: codexHome, FABLE_OUS_AGENTS_PATH: agentsPath };
  mkdirSync(bin);
  mkdirSync(agentsDir);
  const { entry } = installCodexArtifact(codexHome);
  ensureNativeCodexPreferences({ env });
  const nativeMarkerPath = join(codexHome, "fable-ous", "native-preferences.json");
  const originalNativeMarker = readFileSync(nativeMarkerPath);
  const racedConfig = 'personality = "none"\nhide_agent_reasoning = true\n';
  writeCodexInstallCommand(join(bin, "codex"), { installed: [entry] }, `
if [ ! -f '${raceMarker}' ]; then
  printf '%b' '${racedConfig.replaceAll("\n", "\\n")}' > "$CODEX_HOME/config.toml"
  : > '${raceMarker}'
fi
`);
  chmodSync(agentsDir, 0o500);
  let result;
  try {
    result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"],
      { encoding: "utf8", env: { ...process.env, PATH: bin, ...env } }
    );
  } finally {
    chmodSync(agentsDir, 0o700);
  }

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /permission denied|EACCES/i);
  assert.equal(readFileSync(join(codexHome, "config.toml"), "utf8"), racedConfig);
  assert.deepEqual(readFileSync(nativeMarkerPath), originalNativeMarker);
  assert.equal(existsSync(agentsPath), false);
  assert.equal(existsSync(join(codexHome, "fable-ous", "standard.json")), false);
});

test("a failed install never removes a pre-existing unmarked Fable-ous block", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-unmarked-block-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  const fakeCodex = join(bin, "codex");
  const { entry } = installCodexArtifact(codexHome);
  writeCodexInstallCommand(fakeCodex, { installed: [entry] }, `
/bin/rm -f "$CODEX_HOME/config.toml"
/bin/mkdir -p "$CODEX_HOME/config.toml"
`);
  const agentsPath = join(codexHome, "AGENTS.md");
  const original = `# User rules\n\n${MANAGED_CODEX_CONTRACT}\n`;
  writeFileSync(agentsPath, original);

  const result = spawnSync(process.execPath, [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install", "--codex-only"], {
    encoding: "utf8",
    env: { ...process.env, PATH: bin, CODEX_HOME: codexHome }
  });

  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(agentsPath, "utf8"), original);
});

test("doctor fails when the plugin exists but native communication is inactive", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-doctor-inactive-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  const fakeCodex = join(bin, "codex");
  const { entry } = installCodexArtifact(codexHome);
  writePluginListCommand(fakeCodex, { installed: [entry] });

  const result = spawnSync(process.execPath, [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "doctor"], {
    encoding: "utf8",
    env: { ...process.env, PATH: bin, CODEX_HOME: codexHome }
  });
  assert.notEqual(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.codex.installed, true);
  assert.equal(report.codex.healthy, true);
  assert.equal(report.nativeMode.durableStyle, false);
  assert.equal(report.nativeMode.calmPreferences, false);
});

test("doctor reports unhealthy when a managed marker is not a regular file", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-doctor-marker-type-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  const { entry } = installCodexArtifact(codexHome);
  writePluginListCommand(join(bin, "codex"), { installed: [entry] });
  writeNativeDoctorState(codexHome);
  const markerPath = join(codexHome, "fable-ous", "standard.json");
  rmSync(markerPath);
  mkdirSync(markerPath);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "doctor"],
    { encoding: "utf8", env: { ...process.env, PATH: bin, CODEX_HOME: codexHome } }
  );

  assert.notEqual(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.nativeMode.durableStyle, false);
  assert.match(report.nativeMode.error, /safely inspect/i);
});

test("doctor rejects unmatched AGENTS markers around an exact managed contract", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-doctor-marker-shape-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  const { entry } = installCodexArtifact(codexHome);
  writePluginListCommand(join(bin, "codex"), { installed: [entry] });
  writeNativeDoctorState(codexHome);
  const agentsPath = join(codexHome, "AGENTS.md");
  writeFileSync(agentsPath, `${readFileSync(agentsPath, "utf8")}<!-- fable-ous:codex-style:start -->\n`);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "doctor"],
    { encoding: "utf8", env: { ...process.env, PATH: bin, CODEX_HOME: codexHome } }
  );

  assert.notEqual(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.nativeMode.durableStyle, false);
  assert.match(report.nativeMode.error, /safely inspect/i);
});

test("public doctor rejects a bound style block inside an unclosed Markdown fence", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-doctor-open-fence-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  const { entry } = installCodexArtifact(codexHome);
  writePluginListCommand(join(bin, "codex"), { installed: [entry] });
  writeNativeDoctorState(codexHome);
  const agentsPath = join(codexHome, "AGENTS.md");
  writeFileSync(agentsPath, `# Owner docs\n\n\`\`\`markdown\n${readFileSync(agentsPath, "utf8")}`);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "doctor"],
    { encoding: "utf8", env: { ...process.env, PATH: bin, CODEX_HOME: codexHome } }
  );

  assert.notEqual(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.nativeMode.durableStyle, false);
  assert.match(report.nativeMode.error, /safely inspect/i);
});

test("public doctor rejects empty or malformed durable-style ownership markers", {
  skip: process.platform === "win32"
}, () => {
  for (const marker of ["", "{", "{}\n"]) {
    const root = mkdtempSync(join(tmpdir(), "fable-ous-doctor-invalid-style-marker-"));
    const bin = join(root, "bin");
    const codexHome = join(root, "codex-home");
    mkdirSync(bin);
    mkdirSync(codexHome, { recursive: true });
    const { entry } = installCodexArtifact(codexHome);
    writePluginListCommand(join(bin, "codex"), { installed: [entry] });
    writeNativeDoctorState(codexHome);
    writeFileSync(join(codexHome, "fable-ous", "standard.json"), marker);

    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "doctor"],
      { encoding: "utf8", env: { ...process.env, PATH: bin, CODEX_HOME: codexHome } }
    );

    assert.notEqual(result.status, 0, marker);
    const report = JSON.parse(result.stdout);
    assert.equal(report.nativeMode.durableStyle, false, marker);
    assert.match(report.nativeMode.error, /safely inspect/i, marker);
  }
});

test("public doctor reads native settings from CODEX_HOME", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-doctor-codex-home-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  mkdirSync(bin);
  mkdirSync(join(codexHome, "fable-ous"), { recursive: true });
  const fakeCodex = join(bin, "codex");
  const { entry } = installCodexArtifact(codexHome);
  writePluginListCommand(fakeCodex, { installed: [entry] });
  writeNativeDoctorState(codexHome);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "doctor"],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: bin, CODEX_HOME: codexHome }
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.config.personality, "friendly");
  assert.equal(report.config.hideAgentReasoning, "true");
  assert.equal(report.nativeMode.calmPreferences, true);
  assert.equal(report.codex.healthy, true);
  assert.equal(report.codex.version, CODEX_PLUGIN.version);
  assert.equal(report.codex.sourceBound, true);
  assert.equal(report.codex.artifactBound, true);
});

test("doctor rejects enabled stale, hooked, replacement, or wrong-source Codex artifacts", {
  skip: process.platform === "win32"
}, () => {
  const cases = [
    { name: "stale version", options: { version: "0.1.6" } },
    { name: "legacy hook and SDK client", options: { hooks: true, replacementClient: true } },
    { name: "unbound source", options: { sourcePath: "/example/unrelated-fable-ous" } }
  ];

  for (const testCase of cases) {
    const root = mkdtempSync(join(tmpdir(), "fable-ous-doctor-artifact-"));
    const bin = join(root, "bin");
    const codexHome = join(root, "codex-home");
    mkdirSync(bin);
    mkdirSync(codexHome, { recursive: true });
    const { artifact, entry } = installCodexArtifact(codexHome, testCase.options);
    if (testCase.options.hooks || testCase.options.replacementClient) {
      entry.source.path = artifact;
    }
    writePluginListCommand(join(bin, "codex"), { installed: [entry] });
    writeNativeDoctorState(codexHome);

    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "doctor"],
      { encoding: "utf8", env: { ...process.env, PATH: bin, CODEX_HOME: codexHome } }
    );

    assert.notEqual(result.status, 0, testCase.name);
    const report = JSON.parse(result.stdout);
    assert.equal(report.codex.installed, true, testCase.name);
    assert.equal(report.codex.healthy, false, testCase.name);
    if (testCase.options.hooks) assert.equal(report.nativeMode.lifecycleHooks, true);
    if (testCase.options.replacementClient) assert.equal(report.nativeMode.replacementClient, true);
    if (testCase.options.sourcePath) assert.equal(report.codex.sourceBound, false);
  }
});

test("doctor rejects a stale same-version active cache even when the Codex source is exact", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-doctor-active-source-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  const { artifact, entry } = installCodexArtifact(codexHome);
  mkdirSync(join(artifact, "hooks"), { recursive: true });
  writeFileSync(join(artifact, "hooks", "stale.json"), '{"hooks":{}}\n');
  writePluginListCommand(join(bin, "codex"), { installed: [entry] });
  writeNativeDoctorState(codexHome);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "doctor"],
    { encoding: "utf8", env: { ...process.env, PATH: bin, CODEX_HOME: codexHome } }
  );

  assert.notEqual(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.codex.sourceBound, true);
  assert.equal(report.codex.artifactBound, false);
  assert.equal(report.codex.lifecycleHooks, true);
  assert.equal(report.codex.healthy, false);
});

test("doctor rejects an enabled Claude artifact from the old hook and SDK design", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-doctor-claude-artifact-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  const { entry: codexEntry } = installCodexArtifact(codexHome);
  const claudeEntry = installClaudeArtifact(root, { hooks: true, replacementClient: true });
  writePluginListCommand(join(bin, "codex"), { installed: [codexEntry] });
  writePluginListCommand(join(bin, "claude"), [claudeEntry]);
  writeNativeDoctorState(codexHome);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "doctor"],
    { encoding: "utf8", env: { ...process.env, PATH: bin, CODEX_HOME: codexHome } }
  );

  assert.notEqual(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.codex.healthy, true);
  assert.equal(report.claude.installed, true);
  assert.equal(report.claude.healthy, false);
  assert.equal(report.nativeMode.lifecycleHooks, true);
  assert.equal(report.nativeMode.replacementClient, true);
});

test("doctor rejects exact Claude bytes outside the active user cache root", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-doctor-claude-source-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const claudeHome = join(root, "claude-home");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  const { entry: codexEntry } = installCodexArtifact(codexHome);
  const claudeEntry = installClaudeArtifact(join(root, "unrelated-cache"));
  writePluginListCommand(join(bin, "codex"), { installed: [codexEntry] });
  writePluginListCommand(join(bin, "claude"), [claudeEntry]);
  writeNativeDoctorState(codexHome);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "doctor"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: bin,
        CODEX_HOME: codexHome,
        CLAUDE_CONFIG_DIR: claudeHome
      }
    }
  );

  assert.notEqual(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.claude.artifactBound, true);
  assert.equal(report.claude.sourceBound, false);
  assert.equal(report.claude.healthy, false);

  const boundEntry = installClaudeArtifact(claudeHome);
  writePluginListCommand(join(bin, "claude"), [boundEntry]);
  const repaired = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "doctor"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: bin,
        CODEX_HOME: codexHome,
        CLAUDE_CONFIG_DIR: claudeHome
      }
    }
  );
  assert.equal(repaired.status, 0, repaired.stderr);
  const repairedReport = JSON.parse(repaired.stdout);
  assert.equal(repairedReport.claude.sourceBound, true);
  assert.equal(repairedReport.claude.artifactBound, true);
  assert.equal(repairedReport.claude.healthy, true);
});

test("doctor rejects unexpected command or skill capabilities in an otherwise exact Claude artifact", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-doctor-extra-capability-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const claudeHome = join(root, "claude-home");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  const { entry: codexEntry } = installCodexArtifact(codexHome);
  const claudeEntry = installClaudeArtifact(claudeHome, { unexpectedCapability: true });
  writePluginListCommand(join(bin, "codex"), { installed: [codexEntry] });
  writePluginListCommand(join(bin, "claude"), [claudeEntry]);
  writeNativeDoctorState(codexHome);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "doctor"],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: bin, CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeHome }
    }
  );

  assert.notEqual(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.claude.sourceBound, true);
  assert.equal(report.claude.artifactBound, false);
  assert.equal(report.claude.healthy, false);
});

test("install rejects an enabled same-version Claude cache with stale bytes", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-install-stale-claude-"));
  const bin = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const claudeHome = join(root, "claude-home");
  const listCount = join(root, "claude-list-count");
  mkdirSync(bin);
  mkdirSync(codexHome, { recursive: true });
  const { entry: codexEntry } = installCodexArtifact(codexHome);
  writeCodexInstallCommand(join(bin, "codex"), { installed: [codexEntry] });
  const stale = installClaudeArtifact(claudeHome, { unexpectedCapability: true });
  writeFileSync(join(bin, "claude"), `#!/bin/sh
if [ "$1 $2 $3" = "plugin list --json" ]; then
  count=0
  [ -f '${listCount}' ] && count=$(/bin/cat '${listCount}')
  count=$((count + 1))
  printf '%s' "$count" > '${listCount}'
  if [ "$count" -eq 1 ]; then
    printf '%s\\n' '[]'
  else
    printf '%s\\n' '${JSON.stringify([stale])}'
  fi
fi
exit 0
`);
  chmodSync(join(bin, "claude"), 0o700);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "install"],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: bin, CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeHome }
    }
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /installed artifact|expected Fable-ous release/i);
  assert.equal(existsSync(join(codexHome, "AGENTS.md")), false);
  assert.equal(existsSync(join(codexHome, "config.toml")), false);
});

test("the CLI source does not expose model or client launchers", () => {
  const source = readFileSync(new URL("src/cli.mjs", ROOT), "utf8");
  assert.doesNotMatch(source, /createStrictSession|runStrictTurn|launchClaude|claudeLaunchPlan/);
  assert.doesNotMatch(source, /command === "(?:focus|strict|ask)"/);
});

test("host plugin installation completes before global Codex communication files are changed", () => {
  const source = readFileSync(new URL("src/cli.mjs", ROOT), "utf8");
  const installBody = source.slice(source.indexOf("function install(options)"), source.indexOf("function styleOff()"));
  assert.ok(installBody.indexOf('run("claude", claudeInstallPlan(installed))') < installBody.indexOf("ensureCodexCommunicationLayer({ allowLegacyMigration })"));
  assert.match(installBody, /ensureCodexCommunicationLayer\(\{ allowLegacyMigration \}\)/);
  assert.doesNotMatch(installBody, /ensureNativeCodexPreferences\(\)|ensureCodexStyleLayer\(\)/);
});

test("Windows package verification bypasses the recursive npm.cmd shim and runs in CI", () => {
  const checker = readFileSync(new URL("../scripts/check-package.mjs", import.meta.url), "utf8");
  const cli = readFileSync(new URL("../src/cli.mjs", import.meta.url), "utf8");
  const workflow = readFileSync(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8");
  const windowsJob = workflow.slice(workflow.indexOf("  windows-node:"));

  assert.match(checker, /process\.env\.npm_execpath/);
  assert.match(checker, /command:\s*process\.execPath/);
  assert.match(checker, /args:\s*\[npmExecPath, \.\.\.npmArgs\]/);
  assert.match(checker, /\.\.\.npmPlan\.spawnOptions/);
  assert.match(cli, /\.\.\.plan\.spawnOptions/);
  assert.match(windowsJob, /npm run check:package/);
});

test("package verification executes through its public entrypoint", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../scripts/check-package.mjs", import.meta.url))],
    { cwd: SOURCE_ROOT, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Package content verified:/);
});

test("push CI checks the pushed commit instead of an empty main-to-main diff", () => {
  const workflow = readFileSync(new URL(".github/workflows/verify.yml", ROOT), "utf8");
  assert.match(workflow, /github\.event_name == 'pull_request'[\s\S]*git diff --check[\s\S]*github\.event\.pull_request\.base\.sha/);
  assert.doesNotMatch(workflow, /origin\/\$BASE_REF/);
  assert.match(workflow, /github\.event_name == 'push'[\s\S]*git diff --check[\s\S]*github\.event\.before/);
  assert.match(workflow, /BEFORE[\s\S]*0000000000000000000000000000000000000000[\s\S]*exit 1/);
  assert.match(workflow, /git cat-file -e "\$BEFORE\^\{commit\}"/);
  assert.match(workflow, /oven-sh\/setup-bun@v2[\s\S]*bun test test\/fable-ous-boundary\.proof\.test\.ts/);
  assert.match(workflow, /runs-on:\s*windows-latest[\s\S]*npm ci[\s\S]*npm run check/);
});

test("release CI validates both portable plugin manifests", () => {
  const workflow = readFileSync(new URL(".github/workflows/verify.yml", ROOT), "utf8");
  const primaryJob = workflow.slice(workflow.indexOf("  test:"), workflow.indexOf("  windows-node:"));

  assert.match(primaryJob, /npm run validate:plugins/);
  assert.match(primaryJob, /4210c08defe92fe8828f789b6f9fda287ad3709e/);
  assert.match(primaryJob, /@anthropic-ai\/claude-code@2\.1\.251/);
  assert.match(primaryJob, /FABLE_OUS_CODEX_VALIDATOR/);
});

test("plugin validation runs in a clean CI-like home with explicitly provisioned host validators", {
  skip: process.platform === "win32"
}, () => {
  const root = mkdtempSync(join(tmpdir(), "fable-ous-validator-clean-home-"));
  const cleanHome = join(root, "home");
  const codexHome = join(root, "codex-home");
  const codexLog = join(root, "codex-validator.log");
  const claudeLog = join(root, "claude-validator.log");
  const codexValidator = join(root, "validate_plugin.py");
  const claudeValidator = join(root, "claude-validator");
  mkdirSync(cleanHome);
  mkdirSync(codexHome);
  writeFileSync(codexValidator, `from pathlib import Path\nPath(${JSON.stringify(codexLog)}).write_text("validated")\n`);
  writeFileSync(claudeValidator, `#!/bin/sh\nprintf validated > '${claudeLog}'\n`);
  chmodSync(claudeValidator, 0o700);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("scripts/validate-plugins.mjs", ROOT))],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: cleanHome,
        CODEX_HOME: codexHome,
        FABLE_OUS_CODEX_VALIDATOR: codexValidator,
        FABLE_OUS_CLAUDE_COMMAND: claudeValidator
      }
    }
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(readFileSync(codexLog, "utf8"), "validated");
  assert.equal(readFileSync(claudeLog, "utf8"), "validated");
});
