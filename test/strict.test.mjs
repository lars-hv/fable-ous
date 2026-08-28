import assert from "node:assert/strict";
import test from "node:test";

import { focusThreadOptions, runStrictTurn, STRICT_CODEX_CONFIG } from "../src/strict.mjs";

test("Focus config changes presentation without overriding Codex capabilities", () => {
  assert.equal(Object.hasOwn(STRICT_CODEX_CONFIG, "features"), false);
  assert.match(STRICT_CODEX_CONFIG.developer_instructions, /user-visible answer/i);
  assert.doesNotMatch(STRICT_CODEX_CONFIG.developer_instructions, /output schema|material_disclosures|set "state"/i);
});

test("Focus preserves the host sandbox and approval defaults", () => {
  assert.deepEqual(focusThreadOptions({ cwd: "/tmp/example" }), {
    workingDirectory: "/tmp/example",
    skipGitRepoCheck: true
  });
  assert.deepEqual(
    focusThreadOptions({
      cwd: "/tmp/example",
      sandboxMode: "read-only",
      approvalPolicy: "on-request"
    }),
    {
      workingDirectory: "/tmp/example",
      skipGitRepoCheck: true,
      sandboxMode: "read-only",
      approvalPolicy: "on-request"
    }
  );
});

test("Focus returns one natural working-model final without a controller schema", async () => {
  const calls = [];
  const result = await runStrictTurn({
    mainThread: {
      run: async (...args) => {
        calls.push(args);
        return { finalResponse: "Nei. Bevis kundevirkningen først.", usage: { input_tokens: 4 } };
      }
    },
    prompt: "Bør vi bygge dette?"
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["Bør vi bygge dette?"]);
  assert.equal(result.answer, "Nei. Bevis kundevirkningen først.");
  assert.equal(result.turns, 1);
  assert.equal(result.revised, false);
});

test("Focus never auto-continues or rewrites the working model's judgment", async () => {
  let calls = 0;
  const naturalFinal = "Mer arbeid gjenstår. Neste steg er å kjøre fulltesten.";
  const result = await runStrictTurn({
    mainThread: {
      run: async () => {
        calls += 1;
        return { finalResponse: naturalFinal, usage: null };
      }
    },
    prompt: "Fiks problemet."
  });

  assert.equal(calls, 1);
  assert.equal(result.answer, naturalFinal);
});

test("Focus hides raw tool mechanics and returns only the latest natural model message", async () => {
  async function* events() {
    yield { type: "item.completed", item: { type: "command_execution", status: "completed", command: "secret command", aggregated_output: "secret output" } };
    yield { type: "item.completed", item: { type: "agent_message", text: "Kort status underveis." } };
    yield { type: "item.completed", item: { type: "file_change", status: "completed", changes: [{ path: "secret.txt" }] } };
    yield { type: "item.completed", item: { type: "agent_message", text: "Endringen er ferdig og verifisert." } };
    yield { type: "turn.completed", usage: { output_tokens: 7 } };
  }

  let args;
  const result = await runStrictTurn({
    mainThread: {
      runStreamed: async (...values) => {
        args = values;
        return { events: events() };
      }
    },
    prompt: "Fiks dette."
  });

  assert.deepEqual(args, ["Fiks dette."]);
  assert.equal(result.answer, "Endringen er ferdig og verifisert.");
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("Focus does not classify or append its own caveat after a failed command event", async () => {
  const pulses = [];
  const naturalFinal = "Jeg rettet problemet. Den avsluttende testen passerer.";
  async function* events() {
    yield { type: "item.completed", item: { type: "command_execution", status: "failed", command: "npm test", exit_code: 1 } };
    yield { type: "item.completed", item: { type: "agent_message", text: naturalFinal } };
    yield { type: "turn.completed", usage: null };
  }

  const result = await runStrictTurn({
    mainThread: { runStreamed: async () => ({ events: events() }) },
    prompt: "Fiks testen.",
    onProgress: (message) => pulses.push(message)
  });

  assert.deepEqual(pulses, []);
  assert.equal(result.answer, naturalFinal);
});

test("Focus preserves a natural authorization boundary exactly", async () => {
  const boundary = "Jeg slettet ingenting; eksplisitt godkjenning kreves.";
  const result = await runStrictTurn({
    mainThread: { run: async () => ({ finalResponse: boundary, usage: null }) },
    prompt: "Slett alle kundedata."
  });
  assert.equal(result.answer, boundary);
});

test("Focus surfaces a real turn failure", async () => {
  async function* events() {
    yield { type: "turn.failed", error: { message: "Model turn failed." } };
  }
  await assert.rejects(
    () => runStrictTurn({
      mainThread: { runStreamed: async () => ({ events: events() }) },
      prompt: "Hei"
    }),
    /Model turn failed/
  );
});

test("Focus rejects an empty model final", async () => {
  await assert.rejects(
    () => runStrictTurn({
      mainThread: { run: async () => ({ finalResponse: "", usage: null }) },
      prompt: "Hei"
    }),
    /empty final answer/i
  );
});
