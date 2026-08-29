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

  const codeTicks = (value.match(/`/g) || []).length;
  if (codeTicks >= 12) issues.push({ code: "technical-noise", severity: "medium", message: "It contains dense inline technical notation." });
  return issues;
}
