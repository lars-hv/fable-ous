import assert from "node:assert/strict";
import test from "node:test";

import { claudeLaunchPlan } from "../src/cli.mjs";

test("Opus launcher activates Fable-ous without user settings", () => {
  const plan = claudeLaunchPlan(["-p", "Hei"], "claude-opus-5");
  assert.deepEqual(plan.args.slice(0, 2), ["--model", "claude-opus-5"]);
  assert.equal(plan.env.FABLE_OUS_FORCE, "on");
});

test("Fable launcher enables only the quiet-pulse profile", () => {
  const plan = claudeLaunchPlan(["--model=claude-fable-5", "-p", "Hei"]);
  assert.equal(plan.model, "claude-fable-5");
  assert.equal(plan.env.FABLE_OUS_FORCE, "on");
  assert.equal(plan.env.FABLE_OUS_PROFILE, "quiet");
});

test("generic Claude launcher refuses to guess the model", () => {
  assert.throws(() => claudeLaunchPlan(["-p", "Hei"]), /will not guess/);
});
