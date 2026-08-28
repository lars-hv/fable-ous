import assert from "node:assert/strict";
import test from "node:test";

import { claudeInstallPlan, claudeLaunchPlan } from "../src/cli.mjs";

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
