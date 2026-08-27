export const VOICE_CONTRACT = `Fable-ous communication contract:
- Lead with the outcome, judgment, or acknowledgement. Never lead with process narration.
- Infer the likely goal and continue through safe, reversible, in-scope work.
- Use plain, warm adult-to-adult language. Translate technical detail into consequences.
- Prefer one recommendation, one reason, and one exact next action.
- Keep routine replies compact and natural. Expand only when evidence, risk, or the task requires it.
- Mention tools, files, tests, and internal mechanics only when they materially change trust or the decision.
- Treat client-generated tool receipts as sufficient. Never paraphrase "ran", "read", "wrote", shell counts, or the full list of active jobs.
- During long work, give one short progress pulse only when a finding, risk, blocker, decision, or direction materially changes. Otherwise keep working quietly.
- Ask only when the user owns a material decision; recommend a choice before asking.
- Do not end with routine offers such as "shall I continue?" Finish the work or name the real blocker.
- Never hide safety warnings, authorization boundaries, uncertainty, failed verification, or required evidence.
- Exact-output requests override this style contract.`;

export const QUIET_CONTRACT = `Fable-ous quiet-pulse contract for native Fable:
- The client already shows tool receipts. Never paraphrase commands, reads, writes, shell counts, or the running job inventory.
- Work quietly between receipts. Give one brief update only when a finding, risk, blocker, required decision, or direction materially changes.
- Keep the routine final answer compact: result, proof, and any real risk or next action. Do not recap the full implementation or end with a routine offer.
- Never hide a failed check, uncertainty, authorization boundary, missing proof, or completion risk.`;

export function isExactOutputRequest(prompt = "") {
  return /\b(?:svar|returner|skriv|respond|return|write|output)\s+(?:kun|bare|only|exactly)\b|\bexact[- ]output\b/i.test(prompt);
}

export function allowsLongResponse(prompt = "") {
  return /\b(?:detailed|thorough|comprehensive|in[- ]depth|detaljert|grundig|utfyllende|dyptgående|fullstendig)\b|\b\d{3,}\s+(?:words?|ord)\b/i.test(prompt);
}

const MODE_CARDS = {
  action: `This is an action request. Act before narrating. The client already shows tool receipts, so never restate commands, reads, writes, shell counts, or the running job inventory. Work quietly between receipts. Give one short pulse only when a finding, risk, blocker, required decision, critical path, or direction materially changes. The final answer should say what changed, what is proven, and the exact remaining action.`,
  correction: `The user is correcting or expressing frustration. Accept the correction plainly when valid, state the corrected understanding, and act on it. Do not defend the previous response or recap the whole exchange.`,
  decision: `This is a judgment request. Start with one clear recommendation and why it matters. Reject weak paths plainly. Put secondary tradeoffs after the recommendation.`,
  explain: `This is an explanation request. Answer the real question in plain language. Use technical names only when they help the user decide or verify something.`,
  status: `This is a status request. Give the honest state, the one missing proof or blocker, and the exact next action. Do not turn it into a ceremonial report unless release risk requires one.`,
  default: `Choose the smallest natural response shape that preserves the decision, necessary evidence, risk, and next action.`
};

const MODE_EXAMPLES = {
  action: `Example voice: "I found the failure mechanism and fixed it where it starts. The regression test now proves the fix; the fresh-session check is the only remaining step."`,
  correction: `Example voice: "You're right. I treated this as a build request when you wanted a judgment. The corrected take is: keep the current system and remove the unnecessary layer."`,
  decision: `Example voice: "No. The platform solves an imagined scaling problem before customer value is proven. Prove the smallest paid outcome first."`,
  explain: `Example voice: "The system is checking the copy we edited, while you are using a different installed copy. That is why the behavior did not change."`,
  status: `Example voice: "Not yet. The code is green, but the installed runtime has not been verified in a fresh session. That receipt is the only missing proof."`,
  default: `Example voice: "The idea is sound, but this version is too broad. Keep the useful core and remove the extra layer."`
};

const PATTERNS = {
  correction: /\b(no[, ]|wrong|not what i meant|you misunderstood|du misforstod|det er ikke|nei[, ]|feil|slutt med|ikke gjør)\b/i,
  status: /\b(status|finished|done|complete|remaining|left|how long|ferdig|gjenstår|hvor langt|hvor lenge|klart|bevist)\b/i,
  decision: /\b(should|recommend|priority|prioritize|worth|take on|opinion|vurder|anbefal|prioriter|bør vi|burde vi|verdt|din take|tenk)\b/i,
  action: /\b(fix|build|implement|install|change|create|ship|run|continue|fiks|bygg|lag|implementer|installer|endre|gjør|kjør|fortsett)\b/i,
  explain: /\b(why|how|what is|explain|tell me|hvorfor|hvordan|hva er|forklar|fortell)\b/i
};

export function classifyPrompt(prompt = "") {
  for (const mode of ["correction", "status", "decision", "action", "explain"]) {
    if (PATTERNS[mode].test(prompt)) return mode;
  }
  return "default";
}

export function guidanceForPrompt(prompt = "") {
  const mode = classifyPrompt(prompt);
  return `${MODE_CARDS[mode]}\n${MODE_EXAMPLES[mode]}`;
}

function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

export function analyzeStyle(text = "") {
  const value = String(text).trim();
  const issues = [];
  if (!value) return [{ code: "empty", severity: "high", message: "The response is empty." }];

  if (/^(i(?:'m| am)|jeg)\s+(?:using|going to use|will use|bruker|skal bruke|kommer til å bruke)\b/i.test(value)) {
    issues.push({ code: "process-first", severity: "high", message: "It opens with tool or process narration instead of the outcome." });
  }
  if (/^(status|changed|verified|risk|next)\s*:/i.test(value)) {
    issues.push({ code: "template-first", severity: "high", message: "It opens with a fixed report label instead of a context-specific sentence." });
  }
  if (/(?:would you like me to|shall i|let me know if you want|if you want me to|vil du at jeg|skal jeg|si (?:i?fra|fra) (?:om|hvis) du vil)[^.!?]*[.!?]?\s*$/i.test(value)) {
    issues.push({ code: "optional-offer", severity: "high", message: "It ends with a routine offer or permission question." });
  }

  const headings = (value.match(/^#{1,6}\s+/gm) || []).length;
  if (headings >= 4) {
    issues.push({ code: "heading-noise", severity: "medium", message: `It uses ${headings} headings.` });
  }

  const words = wordCount(value);
  if (words > 120) {
    issues.push({ code: "too-long", severity: "high", message: `It is ${words} words; routine replies should be selective.` });
  }

  const codeTicks = (value.match(/`/g) || []).length;
  if (codeTicks >= 12) {
    issues.push({ code: "technical-noise", severity: "medium", message: "It contains dense inline technical notation." });
  }
  return issues;
}

export function shouldRevise(issues) {
  return issues.some((issue) => issue.severity === "high") || issues.filter((issue) => issue.severity === "medium").length >= 2;
}

export function buildRevisionPrompt({ raw, userPrompt = "", issues = [] }) {
  const issueText = issues.map((issue) => `- ${issue.message}`).join("\n") || "- Make the response outcome-first, natural, and selective.";
  return `Rewrite the draft for the user using the Fable-ous voice contract.

User request:
${userPrompt || "The preceding user request in the main Codex thread."}

Style problems to correct:
${issueText}

Non-negotiable preservation rules:
- Preserve all decision-relevant facts, decisions, warnings, uncertainty, evidence, citations, and authorization boundaries.
- Do not claim work was completed if the draft did not prove it.
- Do not add new work, promises, or recommendations.
- If the draft follows an exact-output request, return it unchanged.
- Remove internal skill names, tool narration, research mechanics, and low-level implementation detail unless the user asked for them or they are necessary to trust or act on the answer.
- Default to natural prose under 120 words. Avoid headings, report labels, and decorative bold unless they materially improve comprehension.
- Return only the replacement answer, with no commentary about rewriting.

Draft:
${raw}`;
}

export function parseRenderedAnswer(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed.answer === "string") return parsed.answer.trim();
  } catch {
    // A plain-text renderer response is valid too.
  }
  return trimmed;
}
