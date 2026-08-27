import { Codex } from "@openai/codex-sdk";
import {
  analyzeStyle,
  buildRevisionPrompt,
  isExactOutputRequest,
  parseRenderedAnswer,
  VOICE_CONTRACT
} from "../plugins/fable-ous/scripts/style.mjs";

const RENDER_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" }
  },
  required: ["answer"],
  additionalProperties: false
};

const RENDERER_INSTRUCTIONS = `${VOICE_CONTRACT}

You are the Fable-ous final-answer renderer. Never call tools. Preserve all decision-relevant facts, evidence, warnings, citations, uncertainty, authorization boundaries, and completion status. Omit internal process, skill names, tool narration, and low-level mechanics unless the user asked for them or they are necessary to trust or act on the answer. Do not add claims or promises. Return only the requested structured answer.`;

export { isExactOutputRequest };

export function progressPulseForEvent(event) {
  if (event?.type !== "item.completed") return "";
  const item = event.item || {};
  if (item.type === "file_change") {
    return item.status === "failed"
      ? "Endringen kunne ikke brukes; årsaken undersøkes."
      : "Endringen er gjort; verifisering gjenstår.";
  }
  if (item.type === "command_execution" && item.status === "failed") {
    return "En sjekk feilet; årsaken undersøkes.";
  }
  if (item.type === "mcp_tool_call" && item.status === "failed") {
    return "En ekstern sjekk feilet; Codex prøver en annen trygg vei.";
  }
  return "";
}

async function runMainTurn(thread, prompt, onProgress) {
  if (typeof thread.runStreamed !== "function") return thread.run(prompt);

  const { events } = await thread.runStreamed(prompt);
  const items = [];
  const shown = new Set();
  let finalResponse = "";
  let usage = null;

  for await (const event of events) {
    if (event.type === "item.completed") {
      items.push(event.item);
      if (event.item.type === "agent_message") finalResponse = event.item.text;

      const pulse = progressPulseForEvent(event);
      if (pulse && shown.size < 3 && !shown.has(pulse)) {
        shown.add(pulse);
        await onProgress?.(pulse);
      }
    } else if (event.type === "turn.completed") {
      usage = event.usage;
    } else if (event.type === "turn.failed") {
      throw new Error(event.error?.message || "Codex turn failed.");
    } else if (event.type === "error") {
      throw new Error(event.message || "Codex stream failed.");
    }
  }

  return { items, finalResponse, usage };
}

export function createStrictSession({
  cwd = process.cwd(),
  model,
  effort,
  sandboxMode = "workspace-write",
  approvalPolicy
} = {}) {
  const mainCodex = new Codex({
    config: {
      developer_instructions: VOICE_CONTRACT,
      model_verbosity: "low",
      personality: "none"
    }
  });

  const threadOptions = {
    workingDirectory: cwd,
    skipGitRepoCheck: true,
    sandboxMode,
    ...(model ? { model } : {}),
    ...(effort ? { modelReasoningEffort: effort } : {}),
    ...(approvalPolicy ? { approvalPolicy } : {})
  };

  return {
    mainThread: mainCodex.startThread(threadOptions),
    createRendererThread() {
      const rendererCodex = new Codex({
        config: {
          developer_instructions: RENDERER_INSTRUCTIONS,
          model_verbosity: "low",
          personality: "none"
        }
      });
      return rendererCodex.startThread({
        workingDirectory: cwd,
        skipGitRepoCheck: true,
        sandboxMode: "read-only",
        approvalPolicy: "never",
        ...(model ? { model } : {}),
        ...(effort ? { modelReasoningEffort: effort } : {})
      });
    }
  };
}

export async function runStrictTurn({ mainThread, createRendererThread, prompt, onProgress }) {
  const turn = await runMainTurn(mainThread, prompt, onProgress);
  const raw = String(turn.finalResponse || "").trim();
  const issues = analyzeStyle(raw);

  if (isExactOutputRequest(prompt)) {
    return { answer: raw, raw, revised: false, issues, usage: turn.usage };
  }

  const rendererThread = createRendererThread();
  const renderedTurn = await rendererThread.run(
    buildRevisionPrompt({ raw, userPrompt: prompt, issues }),
    { outputSchema: RENDER_SCHEMA }
  );
  const answer = parseRenderedAnswer(renderedTurn.finalResponse);

  return {
    answer: answer || raw,
    raw,
    revised: Boolean(answer),
    issues,
    usage: turn.usage,
    rendererUsage: renderedTurn.usage
  };
}
