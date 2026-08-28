import { Codex } from "@openai/codex-sdk";
import { analyzeStyle, VOICE_CONTRACT } from "../plugins/fable-ous/scripts/style.mjs";

const FOCUS_INSTRUCTIONS = `${VOICE_CONTRACT}

Your final response is the user-visible answer. Write it as a natural response, not as a structured status envelope. Keep internal reasoning, routine tool activity, command output, file-read inventories, and mechanical progress out of the visible answer. Include failures, uncertainty, risk, missing proof, or authorization boundaries when they materially affect what the user should believe or do. Fable-ous changes presentation only; follow the host's normal coding, tool, plugin, hook, safety, approval, and task-completion behavior.`;

// Kept as a public name for compatibility with the original Strict command.
// The config intentionally changes presentation only and does not override
// Codex features, hooks, plugins, tools, or approval behavior.
export const STRICT_CODEX_CONFIG = {
  developer_instructions: FOCUS_INSTRUCTIONS,
  model_verbosity: "low",
  personality: "none"
};

async function runMainTurn(thread, prompt) {
  if (typeof thread.runStreamed !== "function") {
    const turn = await thread.run(prompt);
    return { finalResponse: turn.finalResponse, usage: turn.usage };
  }

  const { events } = await thread.runStreamed(prompt);
  let finalResponse = "";
  let usage = null;

  for await (const event of events) {
    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      finalResponse = event.item.text || "";
    } else if (event.type === "turn.completed") {
      usage = event.usage;
    } else if (event.type === "turn.failed") {
      throw new Error(event.error?.message || "Codex turn failed.");
    } else if (event.type === "error") {
      throw new Error(event.message || "Codex stream failed.");
    }
  }

  return { finalResponse, usage };
}

export function createStrictSession({
  cwd = process.cwd(),
  model,
  effort,
  sandboxMode,
  approvalPolicy
} = {}) {
  const codex = new Codex({ config: STRICT_CODEX_CONFIG });

  return {
    mainThread: codex.startThread(focusThreadOptions({
      cwd,
      model,
      effort,
      sandboxMode,
      approvalPolicy
    }))
  };
}

export function focusThreadOptions({
  cwd = process.cwd(),
  model,
  effort,
  sandboxMode,
  approvalPolicy
} = {}) {
  return {
    workingDirectory: cwd,
    skipGitRepoCheck: true,
    ...(model ? { model } : {}),
    ...(effort ? { modelReasoningEffort: effort } : {}),
    ...(sandboxMode ? { sandboxMode } : {}),
    ...(approvalPolicy ? { approvalPolicy } : {})
  };
}

export async function runStrictTurn({ mainThread, prompt }) {
  const turn = await runMainTurn(mainThread, prompt);
  const answer = String(turn.finalResponse || "").trim();
  if (!answer) throw new Error("Codex returned an empty final answer.");

  return {
    answer,
    turns: 1,
    revised: false,
    issues: analyzeStyle(answer),
    usage: turn.usage
  };
}
