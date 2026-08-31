import assert from "node:assert/strict";
import test from "node:test";

import { analyzeStyle } from "../plugins/fable-ous/scripts/style.mjs";

test("flags ritualized process-first communication", () => {
  const issues = analyzeStyle("Jeg bruker OpenAI Docs for å undersøke dette. Vil du at jeg fortsetter?");
  assert.deepEqual(issues.map((issue) => issue.code), ["process-first", "optional-offer"]);
});

test("flags fixed status templates", () => {
  assert.equal(analyzeStyle("Status: PATCH FIRST\nChanged: Nothing yet.")[0].code, "template-first");
});

test("accepts compact outcome-first prose", () => {
  const issues = analyzeStyle("Nei. Plattformen løser et skaleringsproblem før kundevirkningen er bevist. Bevis den minste betalte effekten først.");
  assert.deepEqual(issues, []);
});

test("does not treat length alone as a style failure", () => {
  const issues = analyzeStyle(Array.from({ length: 300 }, () => "nyttig").join(" "));
  assert.deepEqual(issues, []);
});
