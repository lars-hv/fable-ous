# Fable-ous verification

Verified on 2026-08-27 with Codex CLI 0.150.1, `@openai/codex-sdk` 0.150.1, Claude Code 2.1.246, Node.js 24.16.0, and macOS.

## What passed

- The deterministic suite passes 22 tests covering Codex injection, task routing, Stop rewrites, strict buffering, exact-output preservation, explicit long-form preservation, Claude Opus activation, unknown-model fail-closed behavior, and Fable bypass.
- Both official plugin validators pass.
- The user-level Codex and Claude installations are enabled and point at the current plugin versions.
- A fresh standard Codex session loaded the plugin and produced an outcome-first final recommendation.
- Codex strict mode exposed no raw progress output and returned only the final rendered answer.
- In an isolated coding fixture, the existing test failed before the Codex change and passed 2/2 afterward. The strict renderer was read-only and did not alter the patch.
- A live Claude Opus 5 wrapper session produced a 148-word Norwegian answer with the recommendation first, plain language, and no routine permission question.
- The Fable launcher and hook fixtures bypass Fable-ous deterministically. No live Fable model call was needed.

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
