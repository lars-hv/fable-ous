function words(text) {
  return String(text).trim().match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) || [];
}

function repetitionRatio(currentWords, previousText) {
  if (currentWords.length < 25) return 0;
  const previousWords = words(previousText).map((word) => word.toLocaleLowerCase());
  if (previousWords.length < 25) return 0;
  const grams = (tokens) => new Set(tokens.slice(0, -4).map((_, index) => tokens.slice(index, index + 5).join(" ")));
  const current = grams(currentWords.map((word) => word.toLocaleLowerCase()));
  const previous = grams(previousWords);
  if (current.size === 0) return 0;
  return [...current].filter((gram) => previous.has(gram)).length / current.size;
}

export function analyzeStyle(text = "", { allowLong = false, previousMessages = [] } = {}) {
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

  const responseWords = words(value);
  if (!allowLong && responseWords.length > 120) {
    issues.push({ code: "too-long", severity: "high", message: `It is ${responseWords.length} words; routine replies should preserve the essential truth with less reading.` });
  }

  const denseParagraph = value
    .split(/\n\s*\n|\n(?=\s*(?:[-*+]|\d+[.)])\s+)/u)
    .find((paragraph) => words(paragraph).length > 90);
  if (denseParagraph) {
    issues.push({ code: "dense-paragraph", severity: "medium", message: "It contains a paragraph over 90 words that is difficult to scan." });
  }

  const progressChatter = /\b(?:next (?:message|update)|neste (?:melding|oppdatering)|no action (?:is )?needed|ingen handling (?:er )?(?:nødvendig|trengs)|will report back|melder (?:seg )?(?:selv|tilbake)|continues? in the background|fortsetter i bakgrunnen)\b/i;
  if (progressChatter.test(value)) {
    issues.push({ code: "progress-chatter", severity: "high", message: "It narrates routine progress instead of waiting for a meaningful delta." });
  }

  const caveats = value.matchAll(/\b(?:not (?:finished|ready|complete)|still (?:missing|blocked)|failed|failure|blocked|unfinished|ikke (?:ferdig|klar)|fortsatt (?:mangler|blokkert)|feil(?:et)?|mislyktes|gjenstår)\b/gi);
  const buriedCaveat = [...caveats].some((caveat) => {
    if (words(value.slice(0, caveat.index)).length < 40) return false;
    const sentenceTail = value.slice(caveat.index).split(/[.!?\n]/u, 1)[0];
    return !/\b(?:but|men)\s+(?:(?:was|is|has been|later|ble|er)\s+)?(?:recovered|resolved|fixed|passed|gjenopprettet|løst|rettet|bestod)\b/i.test(sentenceTail);
  });
  if (buriedCaveat) {
    issues.push({ code: "buried-caveat", severity: "high", message: "A material caveat appears after the first 40 words." });
  }

  if (previousMessages.some((previous) => repetitionRatio(responseWords, previous) >= 0.5)) {
    issues.push({ code: "repeated-status", severity: "high", message: "At least half of the response repeats a recent message instead of reporting only the delta." });
  }

  const codeTicks = (value.match(/`/g) || []).length;
  if (codeTicks >= 12) issues.push({ code: "technical-noise", severity: "medium", message: "It contains dense inline technical notation." });
  return issues;
}
