import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function stateRoot(env = process.env) {
  return env.CLAUDE_PLUGIN_DATA || join(tmpdir(), "fable-ous-sessions");
}

export function isClaudeHost(env = process.env) {
  return Boolean(env.CLAUDE_PLUGIN_ROOT) && !env.PLUGIN_ROOT;
}

export function isFableModel(model = "") {
  return /(?:^|[-_/])fable(?:[-_/]|$)/i.test(String(model));
}

export function decideActivation({ input = {}, env = process.env } = {}) {
  if (!isClaudeHost(env)) return { enabled: true, host: "codex", reason: "codex" };

  const model = String(input.model || env.FABLE_OUS_MODEL || env.ANTHROPIC_MODEL || "").trim();
  if (model) {
    return {
      enabled: !isFableModel(model),
      host: "claude",
      model,
      reason: isFableModel(model) ? "native-fable" : "non-fable-model"
    };
  }

  if (env.FABLE_OUS_FORCE === "off") {
    return { enabled: false, host: "claude", model: "", reason: "forced-off" };
  }

  // Claude may omit the model after /clear. Fail closed so Fable is never
  // accidentally restyled; a fresh model-bearing session enables other models.
  return { enabled: false, host: "claude", model: "", reason: "unknown-model" };
}

function statePath(sessionId = "") {
  const safe = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  return safe ? join(stateRoot(), `${safe}.json`) : "";
}

export function readActivation(sessionId) {
  const path = statePath(sessionId);
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function writeActivation(sessionId, value) {
  const path = statePath(sessionId);
  if (!path) return;
  mkdirSync(stateRoot(), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

export function clearActivation(sessionId) {
  const path = statePath(sessionId);
  if (path) rmSync(path, { force: true });
}
