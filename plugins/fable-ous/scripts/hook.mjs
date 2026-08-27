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
  CODEX_START_CONTRACT,
  compactGuidanceForPrompt,
  guidanceForPrompt,
  isExactOutputRequest,
  shouldRevise,
  QUIET_CONTRACT,
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

function continueQuietly() {
  if (isClaudeHost()) emit({ continue: true });
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

function activationForEvent() {
  if (process.env.FABLE_OUS_FORCE === "off") return { enabled: false, profile: "off" };
  if (!isClaudeHost()) return { enabled: true, profile: "full" };
  return readActivation(sessionId) || { enabled: false, profile: "off" };
}

if (mode === "session-start") {
  const activation = decideActivation({ input });
  writeActivation(sessionId, activation);
  if (activation.enabled) {
    emit({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: activation.profile === "quiet"
          ? QUIET_CONTRACT
          : isClaudeHost()
            ? VOICE_CONTRACT
            : CODEX_START_CONTRACT
      }
    });
  } else {
    continueQuietly();
  }
} else if (mode === "prompt-submit") {
  const activation = readActivation(sessionId);
  if (activation) {
    writeActivation(sessionId, {
      ...activation,
      exactOutput: isExactOutputRequest(input.prompt || ""),
      allowLong: allowsLongResponse(input.prompt || ""),
      revisionUsed: false
    });
  }
  if (activationForEvent().profile === "full") {
    const guidance = isClaudeHost()
      ? guidanceForPrompt(input.prompt || "")
      : compactGuidanceForPrompt(input.prompt || "");
    if (!guidance) process.exit(0);
    emit({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: guidance
      }
    });
  } else {
    continueQuietly();
  }
} else if (mode === "stop") {
  const activation = readActivation(sessionId);
  const issues = analyzeStyle(input.last_assistant_message || "").filter(
    (issue) => !(activation?.allowLong && issue.code === "too-long")
  );
  const revisionAvailable = sessionId ? !activation?.revisionUsed : !input.stop_hook_active;
  if (!activation?.exactOutput && activationForEvent().profile === "full" && revisionAvailable && process.env.FABLE_OUS_STOP_GATE !== "off" && shouldRevise(issues)) {
    if (sessionId && activation) writeActivation(sessionId, { ...activation, revisionUsed: true });
    emit({
      decision: "block",
      reason: `Rewrite the final answer once in plain, natural language. Preserve all decision-relevant facts, proof, warnings, citations, and authorization boundaries. Omit internal process and low-level mechanics unless the user asked for them. Correct these communication problems: ${issues.map((issue) => issue.message).join(" ")} Default to 120 words or fewer. Return only the replacement final answer.`
    });
  } else {
    continueQuietly();
  }
} else if (mode === "session-end") {
  clearActivation(sessionId);
  continueQuietly();
} else {
  continueQuietly();
}
