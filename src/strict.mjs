import { Codex } from "@openai/codex-sdk";
import { analyzeStyle, VOICE_CONTRACT } from "../plugins/fable-ous/scripts/style.mjs";

export const STRICT_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    material_disclosures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["failure", "uncertainty", "missing_proof", "risk", "authorization"]
          },
          text: { type: "string" }
        },
        required: ["kind", "text"],
        additionalProperties: false
      }
    }
  },
  required: ["answer", "material_disclosures"],
  additionalProperties: false
};

const STRICT_MAIN_INSTRUCTIONS = `${VOICE_CONTRACT}

Your final response is the user-visible answer. Return it through the required output schema. Put the natural answer in "answer". Audit every material failed check, uncertainty, missing proof, risk, or authorization boundary in "material_disclosures" with its kind and a short factual text, even when it is already stated naturally in the answer. Never trade correctness, code quality, evidence, or safety for brevity. Do not narrate tools or internal process.`;

function failureDisclosureForEvent(event) {
  if (event?.type !== "item.completed") return "";
  const item = event.item || {};
  if (item.type === "error") {
    return {
      kind: "failure",
      text: "En intern Codex-feil oppstod under arbeidet; sluttresultatet må vurderes med det forbeholdet."
    };
  }
  if (["command_execution", "mcp_tool_call", "file_change"].includes(item.type) && item.status === "failed") {
    return {
      kind: "failure",
      text: "En sjekk feilet under arbeidet; sluttresultatet må vurderes med det forbeholdet."
    };
  }
  return "";
}

export function progressPulseForEvent(event) {
  return failureDisclosureForEvent(event) ? "En sjekk feilet." : "";
}

export function parseStrictEnvelope(value) {
  const raw = String(value || "").trim();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.answer === "string") {
      return {
        answer: parsed.answer.trim(),
        materialDisclosures: Array.isArray(parsed.material_disclosures)
          ? parsed.material_disclosures
            .filter((item) => item && typeof item.kind === "string" && typeof item.text === "string" && item.text.trim())
            .map((item) => ({ kind: item.kind, text: item.text.trim() }))
          : []
      };
    }
  } catch {
    // A plain final is retained as a safe compatibility fallback.
  }
  return { answer: raw, materialDisclosures: [] };
}

function answerContainsDisclosure(answer, disclosure) {
  const value = answer.toLocaleLowerCase();
  const candidate = disclosure.text.toLocaleLowerCase();
  if (value.includes(candidate)) return true;
  const patterns = {
    failure: /feil|failed|mislykt|blokkert|blocked|ikke bestått/i,
    uncertainty: /usikker|uncertain|ukjent|unknown|kan ikke bekrefte|cannot confirm/i,
    missing_proof: /ikke[^.\n]*(?:bevist|verifisert)|mangler[^.\n]*(?:bevis|verifisering)|not[^.\n]*(?:proven|verified)|gjenstår/i,
    risk: /risiko|risk|\bno-go\b|ikke publiser|do not (?:ship|publish)|blokkert|blocked/i,
    authorization: /godkjenning|approval|autorisasjon|authorization|ikke[^.\n]*(?:slettet|sendt|endret)|did not[^.\n]*(?:delete|send|change)/i
  };
  return patterns[disclosure.kind]?.test(answer) || false;
}

function normalizeDisclosures(disclosures) {
  return [...new Map(
    disclosures
      .filter((item) => item && typeof item.kind === "string" && typeof item.text === "string" && item.text.trim())
      .map((item) => [`${item.kind}:${item.text.trim()}`, { kind: item.kind, text: item.text.trim() }])
  ).values()];
}

function composeAnswer(answer, modelDisclosures, systemDisclosures) {
  const cleanAnswer = String(answer || "").trim();
  const audited = normalizeDisclosures(modelDisclosures);
  const enforced = normalizeDisclosures(systemDisclosures);
  const missing = normalizeDisclosures([...audited, ...enforced])
    .filter((item) => !answerContainsDisclosure(cleanAnswer, item));
  if (!missing.length) return cleanAnswer;
  return `${cleanAnswer}${cleanAnswer ? "\n\n" : ""}${missing.map((item) => item.text).join("\n")}`;
}

async function runMainTurn(thread, prompt, onProgress) {
  if (typeof thread.runStreamed !== "function") {
    const turn = await thread.run(prompt, { outputSchema: STRICT_OUTPUT_SCHEMA });
    return { finalResponse: turn.finalResponse, usage: turn.usage, systemDisclosures: [] };
  }

  const { events } = await thread.runStreamed(prompt, { outputSchema: STRICT_OUTPUT_SCHEMA });
  const shown = new Set();
  const systemDisclosures = new Set();
  let finalResponse = "";
  let usage = null;

  for await (const event of events) {
    if (event.type === "item.completed") {
      if (event.item.type === "agent_message") finalResponse = event.item.text;

      const disclosure = failureDisclosureForEvent(event);
      if (disclosure) systemDisclosures.add(JSON.stringify(disclosure));

      const pulse = progressPulseForEvent(event);
      if (pulse && !shown.has(pulse)) {
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

  return { finalResponse, usage, systemDisclosures: [...systemDisclosures].map((item) => JSON.parse(item)) };
}

export function createStrictSession({
  cwd = process.cwd(),
  model,
  effort,
  sandboxMode = "workspace-write",
  approvalPolicy
} = {}) {
  const codex = new Codex({
    config: {
      developer_instructions: STRICT_MAIN_INSTRUCTIONS,
      model_verbosity: "low",
      personality: "none"
    }
  });

  return {
    mainThread: codex.startThread({
      workingDirectory: cwd,
      skipGitRepoCheck: true,
      sandboxMode,
      ...(model ? { model } : {}),
      ...(effort ? { modelReasoningEffort: effort } : {}),
      ...(approvalPolicy ? { approvalPolicy } : {})
    })
  };
}

export async function runStrictTurn({ mainThread, prompt, onProgress }) {
  const turn = await runMainTurn(mainThread, prompt, onProgress);
  const envelope = parseStrictEnvelope(turn.finalResponse);
  const disclosures = [...envelope.materialDisclosures, ...turn.systemDisclosures];
  const answer = composeAnswer(envelope.answer, envelope.materialDisclosures, turn.systemDisclosures);
  if (!answer) throw new Error("Codex returned an empty final answer.");

  return {
    answer,
    revised: false,
    issues: analyzeStyle(answer),
    disclosures: [...new Map(disclosures.map((item) => [`${item.kind}:${item.text}`, item])).values()],
    usage: turn.usage
  };
}
