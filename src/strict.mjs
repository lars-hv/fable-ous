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

export async function runStrictTurn({ mainThread, createRendererThread, prompt }) {
  const turn = await mainThread.run(prompt);
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
