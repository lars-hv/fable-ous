import assert from "node:assert/strict";
import test from "node:test";

import { isExactOutputRequest, progressPulseForEvent, runStrictTurn } from "../src/strict.mjs";

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

test("strict mode exposes curated milestones but never raw agent commentary", async () => {
  const pulses = [];
  async function* events() {
    yield { type: "item.completed", item: { id: "1", type: "command_execution", command: "secret command", aggregated_output: "", status: "completed", exit_code: 0 } };
    yield { type: "item.completed", item: { id: "2", type: "file_change", changes: [{ path: "secret.txt", kind: "update" }], status: "completed" } };
    yield { type: "item.completed", item: { id: "3", type: "agent_message", text: "I ran a secret command and edited secret.txt." } };
    yield { type: "turn.completed", usage: null };
  }

  const result = await runStrictTurn({
    mainThread: { runStreamed: async () => ({ events: events() }) },
    createRendererThread: () => ({
      run: async () => ({ finalResponse: '{"answer":"Endringen er klar for verifisering."}', usage: null })
    }),
    prompt: "Fiks dette",
    onProgress: (message) => pulses.push(message)
  });

  assert.deepEqual(pulses, ["Endringen er gjort; verifisering gjenstår."]);
  assert.equal(result.answer, "Endringen er klar for verifisering.");
  assert.equal(pulses.join(" ").includes("secret"), false);
});

test("progress pulses ignore successful command receipts and report failed checks", () => {
  assert.equal(progressPulseForEvent({
    type: "item.completed",
    item: { type: "command_execution", status: "completed" }
  }), "");
  assert.equal(progressPulseForEvent({
    type: "item.completed",
    item: { type: "command_execution", status: "failed" }
  }), "En sjekk feilet; årsaken undersøkes.");
});
