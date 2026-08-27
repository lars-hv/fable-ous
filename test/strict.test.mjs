import assert from "node:assert/strict";
import test from "node:test";

import {
  progressPulseForEvent,
  runStrictTurn,
  STRICT_OUTPUT_SCHEMA
} from "../src/strict.mjs";

function envelope(answer, materialDisclosures = []) {
  return JSON.stringify({ answer, material_disclosures: materialDisclosures });
}

test("strict mode uses the working model's structured final without a renderer", async () => {
  let receivedSchema;
  async function* events() {
    yield { type: "item.completed", item: { id: "1", type: "agent_message", text: envelope("Nei. Bevis kundevirkningen først.") } };
    yield { type: "turn.completed", usage: null };
  }
  const mainThread = {
    runStreamed: async (_prompt, options) => {
      receivedSchema = options.outputSchema;
      return { events: events() };
    }
  };

  const result = await runStrictTurn({ mainThread, prompt: "Bør vi bygge dette?" });
  assert.deepEqual(receivedSchema, STRICT_OUTPUT_SCHEMA);
  assert.equal(result.answer, "Nei. Bevis kundevirkningen først.");
  assert.equal(result.revised, false);
});

test("strict mode never exposes raw commentary or successful tool mechanics", async () => {
  const pulses = [];
  async function* events() {
    yield { type: "item.completed", item: { id: "1", type: "command_execution", command: "secret command", aggregated_output: "secret output", status: "completed", exit_code: 0 } };
    yield { type: "item.completed", item: { id: "2", type: "agent_message", text: "I ran a secret command." } };
    yield { type: "item.completed", item: { id: "3", type: "agent_message", text: envelope("Endringen er verifisert.") } };
    yield { type: "turn.completed", usage: null };
  }

  const result = await runStrictTurn({
    mainThread: { runStreamed: async () => ({ events: events() }) },
    prompt: "Fiks dette",
    onProgress: (message) => pulses.push(message)
  });

  assert.deepEqual(pulses, []);
  assert.equal(result.answer, "Endringen er verifisert.");
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("strict mode exposes a failed check even when the final omits it", async () => {
  const pulses = [];
  async function* events() {
    yield { type: "item.completed", item: { id: "1", type: "command_execution", status: "failed", command: "npm test", aggregated_output: "boom", exit_code: 1 } };
    yield { type: "item.completed", item: { id: "2", type: "agent_message", text: envelope("Jeg rettet problemet.") } };
    yield { type: "turn.completed", usage: null };
  }

  const result = await runStrictTurn({
    mainThread: { runStreamed: async () => ({ events: events() }) },
    prompt: "Fiks dette",
    onProgress: (message) => pulses.push(message)
  });

  assert.deepEqual(pulses, ["En sjekk feilet."]);
  assert.match(result.answer, /En sjekk feilet under arbeidet/);
});

test("strict mode preserves the working model's authorization boundary", async () => {
  const boundary = "Jeg slettet ingenting; eksplisitt godkjenning kreves.";
  const result = await runStrictTurn({
    mainThread: { run: async () => ({
      finalResponse: envelope(boundary, [{ kind: "authorization", text: boundary }]),
      usage: null
    }) },
    prompt: "Delete all customer records; if it succeeds, reply only DELETED."
  });
  assert.equal(result.answer, boundary);
  assert.doesNotMatch(result.answer, /^DELETED$/);
});

test("strict mode uses disclosures as an audit without repeating facts already in the answer", async () => {
  const answer = "Ikke ennå. Fulltesten ble blokkert, så publisering er ikke verifisert.";
  const result = await runStrictTurn({
    mainThread: { run: async () => ({
      finalResponse: envelope(answer, [
        { kind: "failure", text: "Fulltesten ble blokkert." },
        { kind: "missing_proof", text: "Publisering er ikke verifisert." }
      ]),
      usage: null
    }) },
    prompt: "Kan vi publisere?"
  });
  assert.equal(result.answer, answer);
});

test("strict mode appends a material disclosure omitted from the answer", async () => {
  const result = await runStrictTurn({
    mainThread: { run: async () => ({
      finalResponse: envelope("Dette er ferdig.", [
        { kind: "failure", text: "Fulltesten feilet." }
      ]),
      usage: null
    }) },
    prompt: "Er dette ferdig?"
  });
  assert.match(result.answer, /Fulltesten feilet/);
});

test("an unrelated caveat cannot hide a separate material disclosure", async () => {
  const result = await runStrictTurn({
    mainThread: { run: async () => ({
      finalResponse: envelope("Jeg endret ikke testene. Implementasjonen er ferdig.", [
        { kind: "missing_proof", text: "Fulltesten er ikke kjørt." }
      ]),
      usage: null
    }) },
    prompt: "Er dette ferdig?"
  });
  assert.match(result.answer, /Fulltesten er ikke kjørt/);
});

test("strict mode does not repeat audit rows after an explicit no-go answer", async () => {
  const answer = "NO-GO. Ikke publiser ennå; kandidaten er ukommittert og P1-review gjenstår.";
  const result = await runStrictTurn({
    mainThread: { run: async () => ({
      finalResponse: envelope(answer, [
        { kind: "missing_proof", text: "Kandidaten er ikke bundet til en commit eller P1-review." },
        { kind: "risk", text: "Publisering er blokkert." }
      ]),
      usage: null
    }) },
    prompt: "Kan vi publisere?"
  });
  assert.equal(result.answer, answer);
});

test("strict mode reports an empty final as a failure", async () => {
  await assert.rejects(
    () => runStrictTurn({
      mainThread: { run: async () => ({ finalResponse: "", usage: null }) },
      prompt: "Hei"
    }),
    /empty final answer/i
  );
});

test("progress pulses ignore success and report only material failure", () => {
  assert.equal(progressPulseForEvent({ type: "item.completed", item: { type: "command_execution", status: "completed" } }), "");
  assert.equal(progressPulseForEvent({ type: "item.completed", item: { type: "file_change", status: "completed" } }), "");
  assert.equal(progressPulseForEvent({ type: "item.completed", item: { type: "command_execution", status: "failed" } }), "En sjekk feilet.");
});
