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

test("strict returns the working model final without invoking a renderer", async () => {
  const result = await runStrictTurn({
    mainThread: {
      run: async () => ({
        finalResponse: JSON.stringify({ answer: "Direkte svar.", material_disclosures: [] }),
        usage: null
      })
    },
    createRendererThread: () => {
      throw new Error("renderer must not be created");
    },
    prompt: "Svar direkte."
  } as never);

  expect(result.answer).toBe("Direkte svar.");
  expect(result.revised).toBe(false);
  expect(claudeLaunchPlan(["--model=claude-fable-5"]).env.FABLE_OUS_PROFILE).toBe("quiet");
});
