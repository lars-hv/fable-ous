import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const hook = new URL("../plugins/fable-ous/scripts/hook.mjs", import.meta.url);

function runHook(mode, input, env = {}) {
  const result = spawnSync(process.execPath, [hook.pathname, mode], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("SessionStart injects the shared contract", () => {
  const output = runHook("session-start", { source: "startup" });
  assert.match(output.hookSpecificOutput.additionalContext, /Lead with the outcome/);
});

test("UserPromptSubmit injects task-specific guidance", () => {
  const output = runHook("prompt-submit", { prompt: "Er dette faktisk ferdig?" });
  assert.match(output.hookSpecificOutput.additionalContext, /honest state/i);
});

test("Stop requests one rewrite for a templated answer", () => {
  const output = runHook("stop", { last_assistant_message: "Status: done", stop_hook_active: false });
  assert.equal(output.decision, "block");

  const second = runHook("stop", { last_assistant_message: "Status: done", stop_hook_active: true });
  assert.equal(second.continue, true);
});

test("exact-output prompt bypasses the Stop rewrite", () => {
  const sessionId = `test-exact-${process.pid}`;
  runHook("session-start", { session_id: sessionId, source: "startup" });
  runHook("prompt-submit", { session_id: sessionId, prompt: "Svar kun med ordet OK." });
  const output = runHook("stop", { session_id: sessionId, last_assistant_message: "Status: done", stop_hook_active: false });
  assert.equal(output.continue, true);
  runHook("session-end", { session_id: sessionId });
});

test("explicitly detailed prompt may exceed the routine length gate", () => {
  const sessionId = `test-long-${process.pid}`;
  runHook("session-start", { session_id: sessionId, source: "startup" });
  runHook("prompt-submit", { session_id: sessionId, prompt: "Skriv en detaljert analyse på 500 ord." });
  const longAnswer = Array.from({ length: 200 }, () => "ord").join(" ");
  const output = runHook("stop", { session_id: sessionId, last_assistant_message: longAnswer, stop_hook_active: false });
  assert.equal(output.continue, true);
  runHook("session-end", { session_id: sessionId });
});

test("Claude Fable bypasses all Fable-ous guidance", () => {
  const sessionId = `test-fable-${process.pid}`;
  const env = { CLAUDE_PLUGIN_ROOT: "/tmp/fable-ous", PLUGIN_ROOT: "" };
  const started = runHook("session-start", { session_id: sessionId, source: "startup", model: "claude-fable-5" }, env);
  assert.equal(started.continue, true);

  const prompt = runHook("prompt-submit", { session_id: sessionId, prompt: "Bygg dette" }, env);
  assert.equal(prompt.continue, true);

  const stop = runHook("stop", { session_id: sessionId, last_assistant_message: "Status: done" }, env);
  assert.equal(stop.continue, true);
  runHook("session-end", { session_id: sessionId }, env);
});

test("Claude Opus receives Fable-ous guidance", () => {
  const sessionId = `test-opus-${process.pid}`;
  const env = { CLAUDE_PLUGIN_ROOT: "/tmp/fable-ous", PLUGIN_ROOT: "" };
  const started = runHook("session-start", { session_id: sessionId, source: "startup", model: "claude-opus-5" }, env);
  assert.match(started.hookSpecificOutput.additionalContext, /Lead with the outcome/);

  const prompt = runHook("prompt-submit", { session_id: sessionId, prompt: "Bør vi bygge dette?" }, env);
  assert.match(prompt.hookSpecificOutput.additionalContext, /clear recommendation/i);
  runHook("session-end", { session_id: sessionId }, env);
});

test("Claude Opus launcher model enables guidance when hook input omits model", () => {
  const sessionId = `test-opus-env-${process.pid}`;
  const env = {
    CLAUDE_PLUGIN_ROOT: "/tmp/fable-ous",
    PLUGIN_ROOT: "",
    FABLE_OUS_MODEL: "claude-opus-5",
    FABLE_OUS_FORCE: "on"
  };
  const started = runHook("session-start", { session_id: sessionId, source: "startup" }, env);
  assert.match(started.hookSpecificOutput.additionalContext, /Lead with the outcome/);
  runHook("session-end", { session_id: sessionId }, env);
});

test("Claude with an unknown model fails closed", () => {
  const sessionId = `test-unknown-${process.pid}`;
  const env = { CLAUDE_PLUGIN_ROOT: "/tmp/fable-ous", PLUGIN_ROOT: "" };
  const started = runHook("session-start", { session_id: sessionId, source: "clear" }, env);
  assert.equal(started.continue, true);
  runHook("session-end", { session_id: sessionId }, env);
});

test("Claude clears an old Opus activation when the new model is unknown", () => {
  const sessionId = `test-switch-${process.pid}`;
  const env = { CLAUDE_PLUGIN_ROOT: "/tmp/fable-ous", PLUGIN_ROOT: "" };
  runHook("session-start", { session_id: sessionId, source: "startup", model: "claude-opus-5" }, env);
  const cleared = runHook("session-start", { session_id: sessionId, source: "clear" }, env);
  assert.equal(cleared.continue, true);
  const prompt = runHook("prompt-submit", { session_id: sessionId, prompt: "Bør vi bygge dette?" }, env);
  assert.equal(prompt.continue, true);
  runHook("session-end", { session_id: sessionId }, env);
});
