import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeStyle,
  classifyPrompt,
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

test("flags fixed status templates", () => {
  const issues = analyzeStyle("Status: PATCH FIRST\nChanged: Nothing yet.");
  assert.equal(issues[0].code, "template-first");
  assert.equal(shouldRevise(issues), true);
});

test("accepts compact outcome-first prose", () => {
  const issues = analyzeStyle("Nei. Plattformen løser et skaleringsproblem før kundevirkningen er bevist. Bevis den minste betalte effekten først.");
  assert.deepEqual(issues, []);
});

test("rewrites a long answer even when it has no other style failure", () => {
  const issues = analyzeStyle(Array.from({ length: 161 }, () => "ord").join(" "));
  assert.equal(issues[0].code, "too-long");
  assert.equal(shouldRevise(issues), true);
});

test("parses structured renderer output", () => {
  assert.equal(parseRenderedAnswer('{"answer":"Direct answer."}'), "Direct answer.");
  assert.equal(parseRenderedAnswer("Plain answer."), "Plain answer.");
});
