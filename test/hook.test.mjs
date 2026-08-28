import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ensureCodexStyleLayer } from "../plugins/fable-ous/scripts/activation.mjs";

const hook = new URL("../plugins/fable-ous/scripts/hook.mjs", import.meta.url);

function runHookRaw(mode, input, env = {}) {
  const result = spawnSync(process.execPath, [hook.pathname, mode], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function runHook(mode, input, env = {}) {
  const stdout = runHookRaw(mode, input, env);
  assert.notEqual(stdout.trim(), "", `${mode} unexpectedly emitted no output`);
  return JSON.parse(stdout);
}

function isolatedEnv(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return {
    FABLE_OUS_CONFIG_DIR: join(root, "config"),
    FABLE_OUS_AGENTS_PATH: join(root, "AGENTS.md")
  };
}

test("Codex SessionStart stays completely silent when the durable style layer is active", () => {
  const env = isolatedEnv("fable-ous-hook-style-");
  ensureCodexStyleLayer({ configDir: env.FABLE_OUS_CONFIG_DIR, agentsPath: env.FABLE_OUS_AGENTS_PATH });
  assert.equal(runHookRaw("session-start", { source: "startup" }, env), "");
});

test("plugin-only Codex SessionStart injects one compact fallback line", () => {
  const env = isolatedEnv("fable-ous-hook-fallback-");
  const output = runHook("session-start", { source: "startup" }, env);
  assert.match(output.hookSpecificOutput.additionalContext, /lead with the outcome/i);
  assert.equal(output.hookSpecificOutput.additionalContext.includes("\n"), false);
});

test("Codex prompt and stop hooks are always silent", () => {
  const env = isolatedEnv("fable-ous-hook-no-state-");
  assert.equal(runHookRaw("prompt-submit", { prompt: "API_TOKEN_EXAMPLE" }, env), "");
  assert.equal(runHookRaw("stop", { last_assistant_message: "Status: done" }, env), "");
  assert.equal(existsSync(env.FABLE_OUS_CONFIG_DIR), false);
});

test("the installed hook manifest contains only SessionStart", () => {
  const manifest = JSON.parse(readFileSync(new URL("../plugins/fable-ous/hooks/hooks.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(manifest.hooks), ["SessionStart"]);
});

test("Codex can be forced off without producing a receipt body", () => {
  assert.equal(runHookRaw("session-start", { source: "startup" }, { FABLE_OUS_FORCE: "off" }), "");
});

test("Claude hooks stay silent because the forced output style owns communication", () => {
  const env = { CLAUDE_PLUGIN_ROOT: "/tmp/fable-ous", PLUGIN_ROOT: "" };
  assert.equal(runHookRaw("session-start", { source: "startup", model: "claude-fable-5" }, env), "");
  assert.equal(runHookRaw("session-start", { source: "startup", model: "claude-opus-5" }, env), "");
  assert.equal(runHookRaw("session-start", { source: "clear" }, env), "");
});

test("Claude output style is forced for every model and preserves coding instructions", () => {
  const style = readFileSync(new URL("../plugins/fable-ous/output-styles/fable-ous.md", import.meta.url), "utf8");
  assert.match(style, /^force-for-plugin:\s*true$/m);
  assert.match(style, /^keep-coding-instructions:\s*true$/m);
  assert.match(style, /40[–-]100 words/i);
  assert.match(style, /Do not end while safe, reversible, in-scope work remains/i);
});
