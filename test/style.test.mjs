import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeStyle,
  classifyPrompt,
  compactGuidanceForPrompt,
  guidanceForPrompt,
  isTrivialPrompt,
  parseRenderedAnswer,
  shouldRevise
} from "../plugins/fable-ous/scripts/style.mjs";

test("routes common conversation intents", () => {
  assert.equal(classifyPrompt("Fiks dette og fortsett"), "action");
  assert.equal(classifyPrompt("Er dette faktisk ferdig?"), "status");
  assert.equal(classifyPrompt("Hva er din take på dette?"), "decision");
  assert.equal(classifyPrompt("Nei, du misforstod meg"), "correction");
  assert.equal(classifyPrompt("Forklar hvorfor dette skjer"), "explain");
});

test("flags ritualized process-first communication", () => {
  const issues = analyzeStyle("Jeg bruker OpenAI Docs for å undersøke dette. Vil du at jeg fortsetter?");
  assert.deepEqual(issues.map((issue) => issue.code), ["process-first", "optional-offer"]);
  assert.equal(shouldRevise(issues), true);
});

test("flags common routine commit offers", () => {
  const issues = analyzeStyle("Testene passerer. Filen er ikke committet, si fra om du vil ha den inn.");
  assert.equal(issues.some((issue) => issue.code === "optional-offer"), true);
});

test("flags fixed status templates", () => {
  const issues = analyzeStyle("Status: PATCH FIRST\nChanged: Nothing yet.");
  assert.equal(issues[0].code, "template-first");
  assert.equal(shouldRevise(issues), true);
});

test("accepts compact outcome-first prose", () => {
  const issues = analyzeStyle("Nei. Plattformen løser et skaleringsproblem før kundevirkningen er bevist. Bevis den minste betalte effekten først.");
  assert.deepEqual(issues, []);
});

test("action guidance suppresses duplicate tool receipts but preserves material pulses", () => {
  const guidance = guidanceForPrompt("Fiks dette og fortsett");
  assert.match(guidance, /client already shows tool receipts/i);
  assert.match(guidance, /one short pulse/i);
  assert.match(guidance, /materially changes/i);
});

test("recognizes greetings, identity questions, thanks, and small talk", () => {
  for (const prompt of ["hei", "Hvem er du?", "How are you?", "Tusen takk!"]) {
    assert.equal(isTrivialPrompt(prompt), true, prompt);
    assert.equal(compactGuidanceForPrompt(prompt), "", prompt);
  }
  assert.equal(isTrivialPrompt("Fiks testen"), false);
});

test("Codex guidance is selective, compact, and example-free", () => {
  assert.equal(compactGuidanceForPrompt("Dette er bare en vanlig setning."), "");
  const guidance = compactGuidanceForPrompt("Fiks dette og fortsett");
  assert.match(guidance, /Act before narrating/);
  assert.match(guidance, /proof state materially changes/);
  assert.doesNotMatch(guidance, /Example voice/);
  assert.equal(guidance.includes("\n"), false);
});

test("rewrites a long answer even when it has no other style failure", () => {
  const issues = analyzeStyle(Array.from({ length: 121 }, () => "ord").join(" "));
  assert.equal(issues[0].code, "too-long");
  assert.equal(shouldRevise(issues), true);
});

test("parses structured renderer output", () => {
  assert.equal(parseRenderedAnswer('{"answer":"Direct answer."}'), "Direct answer.");
  assert.equal(parseRenderedAnswer("Plain answer."), "Plain answer.");
});
