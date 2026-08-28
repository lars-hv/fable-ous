import { Codex } from "@openai/codex-sdk";
import { analyzeStyle, VOICE_CONTRACT } from "../plugins/fable-ous/scripts/style.mjs";

const DISCLOSURE_KINDS = ["failure", "uncertainty", "missing_proof", "risk", "authorization"];

export const STRICT_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    state: {
      type: "string",
      enum: ["done", "blocked", "continue"]
    },
    answer: { type: "string" },
    next_action: { type: "string" },
    material_disclosures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: DISCLOSURE_KINDS
          },
          text: { type: "string" }
        },
        required: ["kind", "text"],
        additionalProperties: false
      }
    }
  },
  required: ["state", "answer", "next_action", "material_disclosures"],
  additionalProperties: false
};

const STRICT_MAIN_INSTRUCTIONS = `${VOICE_CONTRACT}

Your final response is the user-visible answer. Return it through the required output schema. Put the natural answer in "answer". Set "state" to "continue" while safe, reversible, in-scope work remains; to "blocked" only when a real user decision, authorization boundary, or external state prevents further progress; and to "done" only when the requested outcome and its required proof are complete. Put the exact next action in "next_action", or an empty string when done. Audit every material failed check, uncertainty, missing proof, risk, or authorization boundary in "material_disclosures" with its kind and a short factual text, even when it is already stated naturally in the answer. Never trade correctness, code quality, evidence, or safety for brevity. Do not narrate tools or internal process.`;

export const STRICT_CODEX_CONFIG = {
  developer_instructions: STRICT_MAIN_INSTRUCTIONS,
  model_verbosity: "low",
  personality: "none",
  // Strict owns the visible transcript. This disables lifecycle hooks only in
  // the child Codex process; plugins and the user's persistent config remain.
  features: { hooks: false }
};

const CONTINUE_PROMPT = "Continue the same task now. Do the remaining safe, reversible, in-scope work. Do not stop at a progress receipt; return done only with the requested outcome and required proof, or blocked with the exact real blocker.";
const BLOCKING_DISCLOSURE_KINDS = new Set(["failure", "missing_proof", "authorization"]);

function commandParts(command = "") {
  return String(command)
    .split(/\r?\n|&&|\|\||;/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isNoMatchSearchPart(part = "") {
  const command = String(part).trim();
  return /^(?:rg|grep)(?:\s|$)/u.test(command);
}

function isReadOnlyInspectionPart(part = "") {
  const command = String(part).trim();
  if (/^(?:pwd|ls(?:\s|$)|cat(?:\s|$)|head(?:\s|$)|tail(?:\s|$)|wc(?:\s|$)|sed\s+-n(?:\s|$))/u.test(command)) {
    return true;
  }
  if (isNoMatchSearchPart(command)) return true;
  if (/^git\s+(?:status|log|show|rev-parse)(?:\s|$)/u.test(command)) return true;
  if (/^git\s+branch\s+--show-current(?:\s|$)/u.test(command)) return true;
  return /^git\s+diff(?:\s|$)/u.test(command)
    && !/(?:^|\s)--(?:check|exit-code|quiet)(?:\s|$)/u.test(command);
}

function isBenignDiscoveryMiss(item = {}) {
  const parts = commandParts(item.command);
  return item.exit_code === 1
    && parts.length > 0
    && parts.some((part) => isNoMatchSearchPart(part))
    && parts.every((part) => isNoMatchSearchPart(part) || part === "pwd");
}

function isMaterialCommandFailure(item = {}) {
  return !isBenignDiscoveryMiss(item);
}

function failureDisclosureForEvent(event) {
  if (event?.type !== "item.completed") return "";
  const item = event.item || {};
  if (item.type === "error") {
    return {
      kind: "failure",
      text: "En intern Codex-feil oppstod under arbeidet; sluttresultatet må vurderes med det forbeholdet."
    };
  }
  if (
    item.status === "failed"
    && (
      (item.type === "command_execution" && isMaterialCommandFailure(item))
      || ["mcp_tool_call", "file_change"].includes(item.type)
    )
  ) {
    return {
      kind: "failure",
      text: "En sjekk feilet under arbeidet; sluttresultatet må vurderes med det forbeholdet."
    };
  }
  return "";
}

function operationKey(item = {}) {
  if (item.type === "command_execution") return `command:${String(item.command || item.id || "unknown")}`;
  if (item.type === "mcp_tool_call") {
    const input = JSON.stringify(item.arguments ?? item.input ?? {});
    return `mcp:${String(item.server || "")}:${String(item.tool || item.name || item.id || "unknown")}:${input}`;
  }
  if (item.type === "file_change") {
    const paths = Array.isArray(item.changes)
      ? item.changes.map((change) => change?.path || "").filter(Boolean).sort().join("|")
      : "";
    return `file:${paths || item.id || "unknown"}`;
  }
  if (item.type === "error") return `error:${String(item.id || "unknown")}`;
  return "";
}

function recoveryKeys(item = {}) {
  const exact = operationKey(item);
  if (item.type !== "command_execution") return exact ? [exact] : [];
  const parts = commandParts(item.command)
    .filter((part) => !isReadOnlyInspectionPart(part))
    .map((part) => `command:${part}`);
  if (parts.length) return [...new Set(parts)];
  return exact ? [exact] : [];
}

export function progressPulseForEvent(event) {
  return failureDisclosureForEvent(event) ? "En sjekk feilet." : "";
}

export function parseStrictEnvelope(value) {
  const raw = String(value || "").trim();
  try {
    const parsed = JSON.parse(raw);
    const validDisclosures = Array.isArray(parsed?.material_disclosures)
      && parsed.material_disclosures.every((item) => (
        item
        && DISCLOSURE_KINDS.includes(item.kind)
        && typeof item.text === "string"
        && item.text.trim()
      ));
    if (
      parsed
      && ["done", "blocked", "continue"].includes(parsed.state)
      && typeof parsed.answer === "string"
      && typeof parsed.next_action === "string"
      && validDisclosures
    ) {
      return {
        state: parsed.state,
        answer: parsed.answer.trim(),
        nextAction: parsed.next_action.trim(),
        materialDisclosures: parsed.material_disclosures
          .map((item) => ({ kind: item.kind, text: item.text.trim() }))
      };
    }
  } catch {
    // Invalid structured output is handled below without exposing raw text.
  }
  if (!raw) return { state: "blocked", answer: "", nextAction: "", materialDisclosures: [] };
  return {
    state: "blocked",
    answer: "Sluttsvaret kunne ikke verifiseres.",
    nextAction: "Kjør oppgaven på nytt.",
    materialDisclosures: [{
      kind: "missing_proof",
      text: "Codex returnerte ikke den påkrevde strukturerte sluttstatusen."
    }]
  };
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

function appendBlockedNextAction(answer, state, nextAction) {
  const action = String(nextAction || "").trim();
  if (state !== "blocked" || !action || answer.toLocaleLowerCase().includes(action.toLocaleLowerCase())) {
    return answer;
  }
  return `${answer}${answer ? "\n\n" : ""}Neste: ${action}`;
}

async function runMainTurn(thread, prompt, outstandingFailures) {
  if (typeof thread.runStreamed !== "function") {
    const turn = await thread.run(prompt, { outputSchema: STRICT_OUTPUT_SCHEMA });
    return { finalResponse: turn.finalResponse, usage: turn.usage };
  }

  const { events } = await thread.runStreamed(prompt, { outputSchema: STRICT_OUTPUT_SCHEMA });
  let finalResponse = "";
  let usage = null;

  for await (const event of events) {
    if (event.type === "item.completed") {
      if (event.item.type === "agent_message") finalResponse = event.item.text;

      const disclosure = failureDisclosureForEvent(event);
      if (disclosure) {
        for (const key of recoveryKeys(event.item)) outstandingFailures.set(key, disclosure);
      }
      else if (event.item.status === "completed") {
        for (const recoveryKey of recoveryKeys(event.item)) outstandingFailures.delete(recoveryKey);
      }

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
  sandboxMode = "workspace-write",
  approvalPolicy
} = {}) {
  const codex = new Codex({
    config: STRICT_CODEX_CONFIG
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

export async function runStrictTurn({
  mainThread,
  prompt,
  onProgress,
  maxContinuationTurns = 3
}) {
  const turnLimit = Math.max(1, Number.isFinite(maxContinuationTurns) ? Math.floor(maxContinuationTurns) : 3);
  const outstandingFailures = new Map();
  let envelope;
  let usage = null;
  let turns = 0;
  let nextPrompt = prompt;

  while (turns < turnLimit) {
    const turn = await runMainTurn(mainThread, nextPrompt, outstandingFailures);
    turns += 1;
    usage = turn.usage;
    envelope = parseStrictEnvelope(turn.finalResponse);

    if (
      envelope.state === "continue"
      && envelope.materialDisclosures.some((item) => item.kind === "authorization")
    ) {
      envelope = { ...envelope, state: "blocked" };
      break;
    }
    if (envelope.state !== "continue") break;
    nextPrompt = CONTINUE_PROMPT;
  }

  if (!envelope) throw new Error("Codex returned no final answer.");

  const systemDisclosures = [...outstandingFailures.values()];
  if (systemDisclosures.length) await onProgress?.("En sjekk feilet.");

  const exhausted = envelope.state === "continue";
  if (exhausted) {
    envelope = {
      ...envelope,
      state: "blocked",
      answer: "Arbeidet er ikke fullført innen den begrensede fortsettelsesrunden.",
      materialDisclosures: [
        ...envelope.materialDisclosures,
        {
          kind: "missing_proof",
          text: "Arbeidet er ikke fullført; nødvendig arbeid eller verifisering gjenstår."
        }
      ]
    };
  }

  const blockingDisclosures = normalizeDisclosures([
    ...envelope.materialDisclosures,
    ...systemDisclosures
  ]).filter((item) => BLOCKING_DISCLOSURE_KINDS.has(item.kind));
  const state = envelope.state === "done" && blockingDisclosures.length ? "blocked" : envelope.state;
  const disclosures = [...envelope.materialDisclosures, ...systemDisclosures];
  const answer = appendBlockedNextAction(
    composeAnswer(envelope.answer, envelope.materialDisclosures, systemDisclosures),
    state,
    envelope.nextAction
  );
  if (!answer) throw new Error("Codex returned an empty final answer.");

  return {
    state,
    answer,
    nextAction: envelope.nextAction,
    turns,
    revised: false,
    issues: analyzeStyle(answer),
    disclosures: [...new Map(disclosures.map((item) => [`${item.kind}:${item.text}`, item])).values()],
    usage
  };
}
