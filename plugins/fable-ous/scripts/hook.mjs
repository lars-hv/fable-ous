#!/usr/bin/env node

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { decideActivation, isClaudeHost, isCodexStyleLayerActive } from "./activation.mjs";
import { CODEX_START_CONTRACT, QUIET_CONTRACT, VOICE_CONTRACT } from "./style.mjs";

async function readInput() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  if (!data.trim()) return {};
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function emit(value) {
  if (value !== null) process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function handleHook({ mode, input = {}, env = process.env } = {}) {
  // Only SessionStart owns style activation. Per-prompt and Stop hooks were
  // deliberately removed: they made the transcript noisier and created unsafe
  // state/rewrite boundaries without improving the coding work.
  if (mode !== "session-start") return null;

  const activation = decideActivation({ input, env });
  if (!activation.enabled) return isClaudeHost(env) ? { continue: true } : null;
  if (!isClaudeHost(env) && isCodexStyleLayerActive({ env })) return null;

  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: activation.profile === "quiet"
        ? QUIET_CONTRACT
        : isClaudeHost(env)
          ? VOICE_CONTRACT
          : CODEX_START_CONTRACT
    }
  };
}

async function main() {
  const mode = process.argv[2];
  const input = await readInput();

  if (process.env.FABLE_OUS_DEBUG_FILE) {
    appendFileSync(
      process.env.FABLE_OUS_DEBUG_FILE,
      `${JSON.stringify({ mode, model: input.model || "", host: isClaudeHost() ? "claude" : "codex" })}\n`
    );
  }

  emit(handleHook({ mode, input }));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) await main();
