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

test("flags routine replies that exceed the attention budget", () => {
  const issues = analyzeStyle(Array.from({ length: 121 }, () => "nyttig").join(" "));
  assert.equal(issues[0].code, "too-long");
});

test("allows necessary long-form material when the caller marks it explicit", () => {
  const paragraphs = Array.from({ length: 4 }, () => Array.from({ length: 50 }, () => "nyttig").join(" "));
  assert.deepEqual(analyzeStyle(paragraphs.join("\n\n"), { allowLong: true }), []);
});

test("flags routine notification narration", () => {
  const issues = analyzeStyle("Alle spor går videre. Neste melding blir sluttresultatet, og ingen handling trengs fra deg.");
  assert.equal(issues[0].code, "progress-chatter");
});

test("flags a material caveat buried after the attention window", () => {
  const preamble = Array.from({ length: 45 }, () => "bakgrunn").join(" ");
  const issues = analyzeStyle(`${preamble} Dette er fortsatt ikke ferdig.`);
  assert.ok(issues.some((issue) => issue.code === "buried-caveat"));
});

test("flags a status reply that substantially repeats the prior message", () => {
  const previous = "Retningen holder og testene kjører videre. Den siste installerte kontrollen gjenstår før vi kan si at begge klientene er klare. Ingen ny beslutning er nødvendig akkurat nå fordi resten av arbeidet er avgrenset.";
  const repeated = `${previous} Jeg fortsetter med samme plan og melder tilbake når kontrollen er ferdig.`;
  const issues = analyzeStyle(repeated, { previousMessages: [previous] });
  assert.ok(issues.some((issue) => issue.code === "repeated-status"));
});
