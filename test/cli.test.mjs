import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { claudeInstallPlan, claudeLaunchPlan, parseArgs } from "../src/cli.mjs";

const ROOT = new URL("../", import.meta.url);

test("public CLI presents Focus Mode while preserving strict as a legacy alias", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("bin/fable-ous.mjs", ROOT)), "help"], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Focus Mode/);
  assert.match(result.stdout, /fable-ous focus/);
  assert.match(result.stdout, /fable-ous strict.*legacy alias/);
  assert.doesNotMatch(result.stdout, /Strict mode/i);
});

test("Focus Mode is the default command and strict remains compatible", () => {
  assert.equal(parseArgs([]).command, "focus");
  assert.equal(parseArgs(["focus"]).command, "focus");
  assert.equal(parseArgs(["strict"]).command, "strict");
});

test("public onboarding installs the persistent Focus command and presents it first", () => {
  const readme = readFileSync(new URL("README.md", ROOT), "utf8");

  assert.match(readme, /npm install --global fable-ous@latest/);
  assert.match(readme, /Focus Mode is the default Fable-ous experience/);
  assert.ok(readme.indexOf("## Focus Mode") < readme.indexOf("## Compatibility mode"));
});

test("npm metadata is publishable and protects the release boundary", () => {
  const packageJson = JSON.parse(readFileSync(new URL("package.json", ROOT), "utf8"));

  assert.equal(packageJson.version, "0.2.3");
  assert.notEqual(packageJson.private, true);
  assert.equal(packageJson.bin["fable-ous"], "bin/fable-ous.mjs");
  assert.match(packageJson.scripts.prepublishOnly, /npm run check/);
  assert.match(packageJson.scripts.prepublishOnly, /validate:plugins/);
  assert.match(packageJson.scripts.prepublishOnly, /check:package/);
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

test("Opus launcher selects Opus while the plugin owns style activation", () => {
  const plan = claudeLaunchPlan(["-p", "Hei"], "claude-opus-5");
  assert.deepEqual(plan.args.slice(0, 2), ["--model", "claude-opus-5"]);
  assert.deepEqual(plan.env, {});
});

test("Fable launcher only selects the model and does not fork the style contract", () => {
  const plan = claudeLaunchPlan(["--model=claude-fable-5", "-p", "Hei"]);
  assert.equal(plan.model, "claude-fable-5");
  assert.deepEqual(plan.env, {});
});

test("Claude clean route loads only local settings plus the exact Fable-ous plugin", () => {
  const plan = claudeLaunchPlan(["--clean", "-p", "Hei"], "claude-opus-5");
  assert.equal(plan.clean, true);
  assert.equal(plan.args.includes("--clean"), false);
  assert.deepEqual(plan.args.slice(0, 4), [
    "--setting-sources",
    "local",
    "--plugin-dir",
    new URL("../plugins/fable-ous", import.meta.url).pathname.replace(/\/$/, "")
  ]);
});

test("generic Claude launcher refuses to guess the model", () => {
  assert.throws(() => claudeLaunchPlan(["-p", "Hei"]), /will not guess/);
});
