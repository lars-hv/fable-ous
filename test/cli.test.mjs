import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { claudeInstallPlan, claudePluginEnabled, parseArgs } from "../src/cli.mjs";

const ROOT = new URL("../", import.meta.url);

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

  assert.match(readme, /npm install --global fable-ous@latest/);
  assert.match(readme, /\bcodex\b/);
  assert.match(readme, /native Codex/i);
  assert.doesNotMatch(readme, /Focus Mode|official Codex SDK|fable-ous strict|fable-ous ask/i);
});

test("npm metadata is publishable and contains no replacement Codex runtime", () => {
  const packageJson = JSON.parse(readFileSync(new URL("package.json", ROOT), "utf8"));

  assert.equal(packageJson.version, "0.2.5");
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
  const installed = JSON.stringify([{ id: "fable-ous@fable-ous", version: "0.2.0" }]);
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

test("Claude status requires the exact enabled plugin instead of a text match", () => {
  assert.equal(claudePluginEnabled(JSON.stringify([
    { id: "fable-ous@fable-ous", enabled: true }
  ])), true);
  assert.equal(claudePluginEnabled(JSON.stringify([
    { id: "fable-ous@fable-ous", enabled: false },
    { id: "another@market", description: "mentions fable-ous" }
  ])), false);
  assert.equal(claudePluginEnabled("not-json"), false);
});

test("the CLI source does not expose model or client launchers", () => {
  const source = readFileSync(new URL("src/cli.mjs", ROOT), "utf8");
  assert.doesNotMatch(source, /createStrictSession|runStrictTurn|launchClaude|claudeLaunchPlan/);
  assert.doesNotMatch(source, /command === "(?:focus|strict|ask)"/);
});

test("host plugin installation completes before global Codex communication files are changed", () => {
  const source = readFileSync(new URL("src/cli.mjs", ROOT), "utf8");
  const installBody = source.slice(source.indexOf("function install(options)"), source.indexOf("function styleOff()"));
  assert.ok(installBody.indexOf('run("claude", claudeInstallPlan(installed))') < installBody.indexOf("ensureCodexStyleLayer()"));
  assert.ok(installBody.indexOf("ensureNativeCodexPreferences()") < installBody.indexOf("ensureCodexStyleLayer()"));
  assert.match(installBody, /catch \(error\)[\s\S]*removeNativeCodexPreferences\(\)[\s\S]*removeCodexStyleLayer\(\)/);
});
