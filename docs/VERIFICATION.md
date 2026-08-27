# Fable-ous verification

Verified on 2026-08-27 with Codex CLI 0.150.1, `@openai/codex-sdk` 0.150.1, Claude Code 2.1.246, Node.js 24.16.0, and macOS.

## What passed

- The deterministic suite passes 28 tests covering Codex injection, quiet-pulse routing, task routing, coordinated Stop rewrites, strict buffering, exact-output preservation, explicit long-form preservation, Claude Opus activation, unknown-model fail-closed behavior, and native Fable's minimal profile.
- Both official plugin validators pass.
- The user-level Codex and Claude installations are enabled and point at the current plugin versions.
- A fresh standard Codex session loaded the plugin and produced an outcome-first final recommendation.
- Codex strict mode exposed no raw progress output and returned only the final rendered answer.
- The quiet-pulse contract is covered by deterministic guidance and eval cases: client tool receipts are not paraphrased, and visible updates are reserved for material state changes.
- In an isolated coding fixture, the existing test failed before the Codex change and passed 2/2 afterward. The strict renderer was read-only and did not alter the patch.
- A live Claude Opus 5 wrapper session produced a 148-word Norwegian answer with the recommendation first, plain language, and no routine permission question.
- The Fable launcher and hook fixtures select only the quiet-pulse profile and bypass full style rewriting deterministically.

## Directional clean-route check

A fresh paired Codex fixture used the same Norwegian file task with Fable-ous forced off and on. Both routes created the exact five-byte `READY` artifact and verified it successfully. The off route emitted two model-authored progress messages before its 13-word final answer. The on route emitted one before its 17-word final answer: 50% fewer in this single case. A failed internal patch attempt remained visible in the client event stream and Codex recovered, so the quieter route did not hide the failure or change the artifact outcome. The on run used more output tokens, so this result is a transcript improvement, not a token-saving claim.

This one pair is evidence for the specific mechanism, not a general percentage claim. The planned cross-model gate is a blinded 24-case clean-route bakeoff with identical fixtures for Opus 5, Sonnet 5, native Fable, and GPT-5.6 Sol. Code/test correctness, authorization, honest completion, and disclosure of material failures are hard gates before style preference is scored.

## Four-model coding check (0.1.5)

The same failing `finite-average` fixture was run in fresh directories with GPT-5.6 Sol, Claude Opus 5, Claude Sonnet 5, and Claude Fable 5. The baseline has one passing and three failing tests. Every model changed only the implementation and reached the same host-verified 4/4 green result; none changed the tests.

| Route | Model-authored progress before final | Final words | Clean-route verdict |
| --- | ---: | ---: | --- |
| Opus 5, full profile | 1 | 107 | Directionally good |
| Fable 5, quiet profile | 1 | 76 | Directionally good |
| Sonnet 5, full profile with Maestro/Superpowers | 7 | 167 | Too noisy |
| Sol, standard Codex with Maestro | 5 | 50 | Too noisy before the final |
| Sol, strict Codex | 2 curated pulses | about 50 | Clean transcript; formal receipt remained blocked |

The strict Sol route hid raw narration, exposed a failed check and the file-change milestone, and preserved the final `NOT VERIFIED` limitation: local tests passed, but Maestro could not write its receipt outside the workspace sandbox. This is the intended transparency boundary.

The Fable and Sonnet finals misstated the exact number of baseline failures after reading truncated command output, although the current 4/4 green result was independently re-run and confirmed. Therefore version 0.1.5 passes this fixture's code-quality oracle but does **not** justify a universal reporting-accuracy or Fable-parity claim. The Sonnet and standard Sol noise came mainly from other mandatory verifier/skill hooks, which a standard style plugin cannot retract after streaming.

## Typical-user isolation

The two noisy routes were repeated with only Fable-ous enabled:

- GPT-5.6 Sol in a clean temporary Codex home loaded only Fable-ous, emitted one progress message and one 30-word final, and passed 4/4 tests.
- Claude Sonnet 5 with all other user plugins disabled loaded only Fable-ous, emitted no progress prose before its 41-word final, and passed 4/4 tests.

This supports a public beta claim that the low-friction plugin materially cleans up ordinary sessions. It also confirms that Lars's heavier Maestro/Superpowers environment needs strict Codex for guaranteed transcript control; those additional hooks, not Fable-ous itself, created most of the extra turns.

## Platform findings

- Codex hooks can inject developer context and ask for one more Stop pass, but ordinary Codex may already have streamed process commentary. Strict mode is required to hide the raw response.
- Claude Code documents an optional `model` field for SessionStart. Claude Code 2.1.246 omitted it in a real `--model claude-opus-5` run, so a plugin cannot safely infer the model every time.
- `fable-ous opus` declares Opus out of band and activates the layer without a settings change. `fable-ous fable` explicitly disables it. The generic Claude launcher refuses to guess.
- Claude's built-in Concise and Proactive output styles are useful prompt controls, not changes to model knowledge or personality. Fable-ous combines their useful behaviors and keeps the coding instructions.

## What is not proven

- The project does not guarantee identical Fable behavior or universal preference.
- It has not yet passed a blinded evaluation against native Fable on real user conversations.
- Standard Codex cannot guarantee a clean transcript before the final answer.
- Claude model switches inside an existing session are not reliably observable; start a new wrapper session after switching.
- Compatibility beyond the versions above requires a fresh matrix run.

## Release gate

Public beta is reasonable after repository privacy checks and a clean commit. A stronger effectiveness claim requires a blinded 30-prompt evaluation and repeated preference from at least five external users.
