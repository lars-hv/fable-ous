import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

// Static imports intentionally reach the complete changed control boundary.
import "../plugins/fable-ous/scripts/hook.mjs";
import { claudeLaunchPlan } from "../src/cli.mjs";
import { runStrictTurn } from "../src/strict.mjs";

const hook = new URL("../plugins/fable-ous/scripts/hook.mjs", import.meta.url);

test("Codex per-turn hooks emit no visible body", () => {
  const prompt = spawnSync(process.execPath, [hook.pathname, "prompt-submit"], {
    input: JSON.stringify({ prompt: "Bør vi bygge dette?" }),
    encoding: "utf8"
  });
  const stop = spawnSync(process.execPath, [hook.pathname, "stop"], {
    input: JSON.stringify({ last_assistant_message: "Status: done" }),
    encoding: "utf8"
  });
  expect(prompt.status).toBe(0);
  expect(stop.status).toBe(0);
  expect(prompt.stdout).toBe("");
  expect(stop.stdout).toBe("");
});

test("Focus returns one natural working-model final without a controller or renderer", async () => {
  const calls: unknown[][] = [];
  const result = await runStrictTurn({
    mainThread: {
      run: async (...args: unknown[]) => {
        calls.push(args);
        return { finalResponse: "Direkte svar.", usage: null };
      }
    },
    createRendererThread: () => {
      throw new Error("renderer must not be created");
    },
    prompt: "Svar direkte."
  } as never);

  expect(result.answer).toBe("Direkte svar.");
  expect(result.revised).toBe(false);
  expect(calls).toEqual([["Svar direkte."]]);
  expect(claudeLaunchPlan(["--model=claude-opus-5"]).env).toEqual({});
});
