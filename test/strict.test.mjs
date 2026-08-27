import assert from "node:assert/strict";
import test from "node:test";

import { isExactOutputRequest, runStrictTurn } from "../src/strict.mjs";

test("strict mode renders even a mechanically clean answer", async () => {
  let rendererCreated = false;
  const result = await runStrictTurn({
    mainThread: { run: async () => ({ finalResponse: "Nei. Bevis kundevirkningen først.", usage: null }) },
    createRendererThread: () => {
      rendererCreated = true;
      return { run: async () => ({ finalResponse: '{"answer":"Nei. Bevis kundevirkningen før dere bygger mer."}', usage: null }) };
    },
    prompt: "Bør vi bygge dette?"
  });
  assert.equal(result.answer, "Nei. Bevis kundevirkningen før dere bygger mer.");
  assert.equal(result.revised, true);
  assert.equal(rendererCreated, true);
});

test("strict mode hides and rewrites a failing raw answer", async () => {
  const result = await runStrictTurn({
    mainThread: { run: async () => ({ finalResponse: "Status: PATCH FIRST", usage: null }) },
    createRendererThread: () => ({
      run: async () => ({ finalResponse: '{"answer":"Dette trenger én rettelse før det kan sendes."}', usage: null })
    }),
    prompt: "Kan dette sendes?"
  });
  assert.equal(result.answer, "Dette trenger én rettelse før det kan sendes.");
  assert.equal(result.revised, true);
  assert.equal(result.raw, "Status: PATCH FIRST");
});

test("strict mode preserves exact-output requests without a renderer pass", async () => {
  let rendererCreated = false;
  const result = await runStrictTurn({
    mainThread: { run: async () => ({ finalResponse: "OK", usage: null }) },
    createRendererThread: () => {
      rendererCreated = true;
      return { run: async () => ({ finalResponse: '{"answer":"Noe annet"}', usage: null }) };
    },
    prompt: "Svar kun med ordet OK."
  });
  assert.equal(result.answer, "OK");
  assert.equal(result.revised, false);
  assert.equal(rendererCreated, false);
  assert.equal(isExactOutputRequest("Return only READY"), true);
});
