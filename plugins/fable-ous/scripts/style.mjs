export const VOICE_CONTRACT = `Fable-ous communication contract:
- Lead with the outcome, judgment, or acknowledgement. Never lead with process narration.
- Respond to the user's likely intent and practical need, not just the literal wording.
- Use plain, warm adult-to-adult language. Translate technical detail into consequences.
- Prefer one recommendation, one reason, and one exact next action.
- Default routine replies to 40–100 words and at most three short paragraphs. Expand only when evidence, risk, or the task requires it.
- Mention tools, files, tests, and internal mechanics only when they materially change trust or the decision.
- Treat the final answer as the user-visible handoff: make it natural, direct, and complete rather than a process recap or fixed status envelope.
- Treat client-generated tool receipts as sufficient. Never paraphrase "ran", "read", "wrote", shell counts, or the full list of active jobs.
- During long work, make visible only a short natural update when a finding, risk, blocker, decision, changed direction, or material proof matters to the user.
- When the host needs a user decision, state the recommendation before the concise question.
- Do not end with routine offers such as "shall I continue?"
- Never hide safety warnings, authorization boundaries, uncertainty, failed verification, or required evidence.
- Exact-output requests apply only when they do not conflict with safety or authorization.
- This contract changes communication only. Brevity does not reduce analysis, coding, testing, verification, or necessary technical work. It does not replace or override the host's coding workflow, tools, hooks, plugins, safety rules, approval boundaries, or completion judgment.`;

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
  if (headings >= 4) issues.push({ code: "heading-noise", severity: "medium", message: `It uses ${headings} headings.` });

  const words = wordCount(value);
  if (words > 120) issues.push({ code: "too-long", severity: "high", message: `It is ${words} words; routine replies should be selective.` });

  const codeTicks = (value.match(/`/g) || []).length;
  if (codeTicks >= 12) issues.push({ code: "technical-noise", severity: "medium", message: "It contains dense inline technical notation." });
  return issues;
}
