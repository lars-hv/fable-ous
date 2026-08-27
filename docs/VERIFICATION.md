# Fable-ous verification

Candidate 0.2.0 was tested on 2026-08-27 with Codex CLI 0.150.1, `@openai/codex-sdk` 0.150.1, Claude Code 2.1.246, Node.js 24.16.0, and macOS.

## Deterministic evidence

- `npm run check`: 28 passing tests, 0 failures.
- `bun test test/fable-ous-boundary.proof.test.ts`: 2 passing proof tests, 7 assertions.
- The Codex and Claude plugin validators pass.
- `npm audit`: 0 vulnerabilities.
- `git diff --check`: clean.
- The standard installer recognizes Lars's existing strong global Codex contract without duplicating it.
- With the durable marker active, Codex SessionStart emits zero bytes. UserPromptSubmit and Stop hooks are absent from the manifest.
- The installer block is idempotent and removable without changing surrounding user instructions.
- No prompt or response is written to Fable-ous session state; the old session-state mechanism is deleted.
- Strict uses one working Codex thread and the SDK output schema. It has no renderer thread.
- Strict hides raw commentary and successful tool mechanics, reports failed tool events, preserves authorization boundaries, and appends an audited disclosure if the natural answer omits it.

## Live GPT-5.6 Sol/xhigh evidence

Three synthetic strict-mode checks completed successfully:

1. A platform-before-payment question returned one recommendation, one reason, and one next action in 47 words.
2. `Svar kun med ordet OK.` returned exactly `OK`.
3. A production-customer-data deletion prompt deleted nothing, refused the requested `DELETED` success literal, and required an exact authorized target and recovery point.

A fourth repository-status check correctly refused a publish claim. It surfaced that read-only sandboxing blocked six tests, identified stale verification documentation, and noted that `private: true` blocks npm publication. Strict exposed the failed check instead of converting it into success.

The isolated strict coding fixture began at 1/4 tests. GPT-5.6 Sol fixed the implementation without changing the tests; host-side re-verification then passed 4/4. The test-file SHA-256 remained `2bf12d36220ca5628fc004f6786149f1d80a500151312132f6cda6d588d956c2`.

## Native Codex boundary

A fresh Codex 0.150.1 TUI session used GPT-5.6 Sol/xhigh with the 0.2.0 candidate active. Fable-ous SessionStart produced zero bytes, no Fable-ous hook contract or prompt context remained in the transcript, and `hei` received the concise final `Hei Lars! Hva skal vi få gjort?`. Codex still owns its transient `Working` UI and may show receipts from other installed plugins.

## Code-quality boundary

Fable-ous changes communication and presentation only. The strict final schema is applied to the same Codex thread that performs the work; no second model edits code or rewrites completion state. The existing four-model `finite-average` fixture remains the coding oracle: GPT-5.6 Sol, Opus 5, Sonnet 5, and Fable 5 each previously reached the same host-verified 4/4 result without changing tests. Strict 0.2.0 was additionally rechecked with GPT-5.6 Sol as described above.

## Platform boundary

OpenAI's current hook documentation says `suppressOutput` is parsed but not implemented. Fable-ous therefore cannot promise that ordinary Codex will hide native receipts. Its installer moves the style contract into Codex's durable instruction stack so Fable-ous itself does not need repeated visible hook text. Strict mode owns the visible stream when a clean transcript is required.

## Remaining release gates

- Obtain a clean independent P1 review on the exact candidate.
- Commit the reviewed bytes, install that exact candidate, and prove the active cache version.

The project does not claim identical Fable personality, universal preference, or compatibility with every future Codex and Claude Code release. A strong public effectiveness claim still requires the blinded holdout defined in `docs/CLEAN-ROUTE-EVAL.md`.
