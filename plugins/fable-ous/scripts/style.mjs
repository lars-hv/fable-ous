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
- Exact-output requests apply only when they do not conflict with safety or authorization.`;

export const CODEX_START_CONTRACT = `Fable-ous: lead with the outcome; continue through safe in-scope work without routine permission questions; use warm, plain, compact language; trust client tool receipts and speak only for material findings, risks, blockers, decisions, changed direction, or proof; never hide failure, uncertainty, evidence, or authorization boundaries.`;

export const QUIET_CONTRACT = `Fable-ous quiet-pulse contract for native Fable:
- The client already shows tool receipts. Never paraphrase commands, reads, writes, shell counts, or the running job inventory.
- Work quietly between receipts. Give one brief update only when a finding, risk, blocker, required decision, or direction materially changes.
- Keep the routine final answer compact: result, proof, and any real risk or next action. Do not recap the full implementation or end with a routine offer.
- Never hide a failed check, uncertainty, authorization boundary, missing proof, or completion risk.`;

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
