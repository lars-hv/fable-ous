#!/usr/bin/env node

import { appendFileSync } from "node:fs";
import {
  clearActivation,
  decideActivation,
  isClaudeHost,
  readActivation,
  writeActivation
} from "./activation.mjs";
import {
  allowsLongResponse,
  analyzeStyle,
  guidanceForPrompt,
  isExactOutputRequest,
  shouldRevise,
  VOICE_CONTRACT
} from "./style.mjs";

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
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

const mode = process.argv[2];
const input = await readInput();
const sessionId = input.session_id || input.sessionId || "";

if (process.env.FABLE_OUS_DEBUG_FILE) {
  appendFileSync(
    process.env.FABLE_OUS_DEBUG_FILE,
    `${JSON.stringify({
      mode,
      inputKeys: Object.keys(input).sort(),
      model: input.model || "",
      sessionId,
      hostSignals: {
        claudePluginRoot: Boolean(process.env.CLAUDE_PLUGIN_ROOT),
        pluginRoot: Boolean(process.env.PLUGIN_ROOT),
        claudePluginData: Boolean(process.env.CLAUDE_PLUGIN_DATA),
        declaredModel: process.env.FABLE_OUS_MODEL || process.env.ANTHROPIC_MODEL || "",
        force: process.env.FABLE_OUS_FORCE || ""
      }
    })}\n`
  );
}

function activeForEvent() {
  if (!isClaudeHost()) return true;
  return readActivation(sessionId)?.enabled === true;
}

if (mode === "session-start") {
  const activation = decideActivation({ input });
  writeActivation(sessionId, activation);
  if (activation.enabled) {
    emit({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: VOICE_CONTRACT
      }
    });
  } else {
    emit({ continue: true });
  }
} else if (mode === "prompt-submit") {
  const activation = readActivation(sessionId);
  if (activation) {
    writeActivation(sessionId, {
      ...activation,
      exactOutput: isExactOutputRequest(input.prompt || ""),
      allowLong: allowsLongResponse(input.prompt || "")
    });
  }
  if (activeForEvent()) {
    emit({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: guidanceForPrompt(input.prompt || "")
      }
    });
  } else {
    emit({ continue: true });
  }
} else if (mode === "stop") {
  const activation = readActivation(sessionId);
  const issues = analyzeStyle(input.last_assistant_message || "").filter(
    (issue) => !(activation?.allowLong && issue.code === "too-long")
  );
  if (!activation?.exactOutput && activeForEvent() && !input.stop_hook_active && process.env.FABLE_OUS_STOP_GATE !== "off" && shouldRevise(issues)) {
    emit({
      decision: "block",
      reason: `Rewrite the final answer once in plain, natural language. Preserve all decision-relevant facts, proof, warnings, citations, and authorization boundaries. Omit internal process and low-level mechanics unless the user asked for them. Correct these communication problems: ${issues.map((issue) => issue.message).join(" ")} Default to 120 words or fewer. Return only the replacement final answer.`
    });
  } else {
    emit({ continue: true });
  }
} else if (mode === "session-end") {
  clearActivation(sessionId);
  emit({ continue: true });
} else {
  emit({ continue: true });
}
