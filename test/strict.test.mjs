import assert from "node:assert/strict";
import test from "node:test";

import {
  progressPulseForEvent,
  runStrictTurn,
  STRICT_CODEX_CONFIG,
  STRICT_OUTPUT_SCHEMA
} from "../src/strict.mjs";

function envelope(answer, materialDisclosures = [], state = "done", nextAction = "") {
  return JSON.stringify({
    state,
    answer,
    next_action: nextAction,
    material_disclosures: materialDisclosures
  });
}

test("strict owns the transcript by disabling lifecycle hooks only for its child Codex process", () => {
  assert.equal(STRICT_CODEX_CONFIG.features.hooks, false);
  assert.equal(Object.hasOwn(STRICT_CODEX_CONFIG.features, "plugins"), false);
});

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

test("strict mode continues the same working thread without exposing an intermediate receipt", async () => {
  const prompts = [];
  const replies = [
    envelope("Testene må kjøres.", [], "continue", "Kjør testene."),
    envelope("Endringen er ferdig og testene passerer.")
  ];
  const result = await runStrictTurn({
    mainThread: {
      run: async (prompt) => {
        prompts.push(prompt);
        return { finalResponse: replies.shift(), usage: null };
      }
    },
    prompt: "Fiks problemet."
  });

  assert.equal(prompts.length, 2);
  assert.equal(result.answer, "Endringen er ferdig og testene passerer.");
  assert.equal(result.state, "done");
  assert.equal(result.turns, 2);
});

test("strict mode fails honest after the bounded continuation budget", async () => {
  let calls = 0;
  const result = await runStrictTurn({
    mainThread: {
      run: async () => {
        calls += 1;
        return {
          finalResponse: envelope("Mer arbeid gjenstår.", [], "continue", "Fortsett verifiseringen."),
          usage: null
        };
      }
    },
    prompt: "Fiks problemet.",
    maxContinuationTurns: 2
  });

  assert.equal(calls, 2);
  assert.equal(result.state, "blocked");
  assert.equal(result.turns, 2);
  assert.match(result.answer, /ikke fullført/i);
  assert.ok(result.disclosures.some((item) => item.kind === "missing_proof"));
});

test("strict mode cannot report done while a blocking disclosure remains", async () => {
  const result = await runStrictTurn({
    mainThread: { run: async () => ({
      finalResponse: envelope("Endringen er ferdig.", [
        { kind: "missing_proof", text: "Fulltesten er ikke kjørt." }
      ]),
      usage: null
    }) },
    prompt: "Er dette ferdig?"
  });

  assert.equal(result.state, "blocked");
  assert.match(result.answer, /Fulltesten er ikke kjørt/);
});

test("strict mode surfaces the exact next action for a real blocker", async () => {
  const result = await runStrictTurn({
    mainThread: { run: async () => ({
      finalResponse: envelope(
        "Publisering er blokkert av manglende godkjenning.",
        [{ kind: "authorization", text: "Produksjonsendringen krever godkjenning." }],
        "blocked",
        "Godkjenn den eksakte produksjonsendringen."
      ),
      usage: null
    }) },
    prompt: "Publiser dette."
  });

  assert.equal(result.state, "blocked");
  assert.match(result.answer, /Neste: Godkjenn den eksakte produksjonsendringen\./);
});

test("an authorization disclosure stops hidden continuation immediately", async () => {
  let calls = 0;
  const result = await runStrictTurn({
    mainThread: { run: async () => {
      calls += 1;
      return {
        finalResponse: envelope(
          "Godkjenning kreves før produksjonsendringen.",
          [{ kind: "authorization", text: "Produksjonsendringen krever godkjenning." }],
          "continue",
          "Godkjenn den eksakte produksjonsendringen."
        ),
        usage: null
      };
    } },
    prompt: "Publiser dette."
  });

  assert.equal(calls, 1);
  assert.equal(result.state, "blocked");
  assert.match(result.answer, /Neste: Godkjenn den eksakte produksjonsendringen\./);
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
  assert.equal(result.state, "blocked");
  assert.match(result.answer, /En sjekk feilet under arbeidet/);
});

test("a recovered red check does not block the verified final", async () => {
  const pulses = [];
  async function* events() {
    yield { type: "item.completed", item: { id: "1", type: "command_execution", status: "failed", command: "npm test", exit_code: 1 } };
    yield { type: "item.completed", item: { id: "2", type: "command_execution", status: "completed", command: "npm test\nnode --check average.mjs", exit_code: 0 } };
    yield { type: "item.completed", item: { id: "3", type: "agent_message", text: envelope("Endringen er ferdig og testen passerer.") } };
    yield { type: "turn.completed", usage: null };
  }

  const result = await runStrictTurn({
    mainThread: { runStreamed: async () => ({ events: events() }) },
    prompt: "Fiks testen.",
    onProgress: (message) => pulses.push(message)
  });

  assert.equal(result.state, "done");
  assert.deepEqual(pulses, []);
  assert.deepEqual(result.disclosures, []);
  assert.doesNotMatch(result.answer, /feilet/i);
});

test("a non-material discovery miss does not become a final failure receipt", async () => {
  const pulses = [];
  async function* events() {
    yield { type: "item.completed", item: { id: "1", type: "command_execution", status: "failed", command: "rg --files -g AGENTS.md", exit_code: 1 } };
    yield { type: "item.completed", item: { id: "2", type: "agent_message", text: envelope("Oppgaven er ferdig.") } };
    yield { type: "turn.completed", usage: null };
  }

  const result = await runStrictTurn({
    mainThread: { runStreamed: async () => ({ events: events() }) },
    prompt: "Gjør oppgaven.",
    onProgress: (message) => pulses.push(message)
  });

  assert.equal(result.state, "done");
  assert.deepEqual(pulses, []);
  assert.deepEqual(result.disclosures, []);
});

test("missing evidence and semantic git diff exits cannot hide behind discovery", async () => {
  for (const command of [
    "cat definitely-missing-proof.txt",
    "git diff --exit-code"
  ]) {
    async function* events() {
      yield { type: "item.completed", item: { id: command, type: "command_execution", status: "failed", command, exit_code: 1 } };
      yield { type: "item.completed", item: { id: `${command}-message`, type: "agent_message", text: envelope("Endringen er ferdig.") } };
      yield { type: "turn.completed", usage: null };
    }

    const result = await runStrictTurn({
      mainThread: { runStreamed: async () => ({ events: events() }) },
      prompt: "Er dette ferdig?"
    });
    assert.equal(result.state, "blocked", command);
    assert.ok(result.disclosures.some((item) => item.kind === "failure"), command);
  }
});

test("material verification commands cannot fail behind a done envelope", async () => {
  for (const command of [
    "git diff --check",
    "npm audit",
    "npx tsc --noEmit",
    "python3 validate_plugin.py plugins/fable-ous"
  ]) {
    async function* events() {
      yield { type: "item.completed", item: { id: command, type: "command_execution", status: "failed", command, exit_code: 1 } };
      yield { type: "item.completed", item: { id: `${command}-message`, type: "agent_message", text: envelope("Endringen er ferdig.") } };
      yield { type: "turn.completed", usage: null };
    }

    const result = await runStrictTurn({
      mainThread: { runStreamed: async () => ({ events: events() }) },
      prompt: "Er dette ferdig?"
    });
    assert.equal(result.state, "blocked", command);
    assert.ok(result.disclosures.some((item) => item.kind === "failure"), command);
  }
});

test("a failed check recovered in a hidden continuation does not leak or block", async () => {
  const pulses = [];
  let turn = 0;
  const result = await runStrictTurn({
    mainThread: { runStreamed: async () => {
      turn += 1;
      async function* events() {
        yield {
          type: "item.completed",
          item: {
            id: String(turn),
            type: "command_execution",
            status: turn === 1 ? "failed" : "completed",
            command: "npm test",
            exit_code: turn === 1 ? 1 : 0
          }
        };
        yield {
          type: "item.completed",
          item: {
            id: `message-${turn}`,
            type: "agent_message",
            text: turn === 1
              ? envelope("Testen må rettes.", [], "continue", "Rett feilen og kjør testen igjen.")
              : envelope("Endringen er ferdig og testen passerer.")
          }
        };
        yield { type: "turn.completed", usage: null };
      }
      return { events: events() };
    } },
    prompt: "Fiks testen.",
    onProgress: (message) => pulses.push(message)
  });

  assert.equal(result.turns, 2);
  assert.equal(result.state, "done");
  assert.deepEqual(pulses, []);
  assert.deepEqual(result.disclosures, []);
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

test("strict mode fails closed on an invalid structured final", async () => {
  const result = await runStrictTurn({
    mainThread: { run: async () => ({ finalResponse: "Looks done.", usage: null }) },
    prompt: "Fiks dette."
  });

  assert.equal(result.state, "blocked");
  assert.match(result.answer, /kunne ikke verifiseres/i);
  assert.ok(result.disclosures.some((item) => item.kind === "missing_proof"));
});

test("progress pulses ignore success and report only material failure", () => {
  assert.equal(progressPulseForEvent({ type: "item.completed", item: { type: "command_execution", status: "completed" } }), "");
  assert.equal(progressPulseForEvent({ type: "item.completed", item: { type: "file_change", status: "completed" } }), "");
  assert.equal(progressPulseForEvent({ type: "item.completed", item: { type: "command_execution", status: "failed", command: "npm test" } }), "En sjekk feilet.");
  assert.equal(progressPulseForEvent({ type: "item.completed", item: { type: "command_execution", status: "failed", command: "rg --files", exit_code: 1 } }), "");
});
