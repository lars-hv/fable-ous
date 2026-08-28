# Fable-ous verification

Candidate 0.2.2 was tested on 2026-08-28 with Codex CLI 0.150.1, `@openai/codex-sdk` 0.150.1, Claude Code 2.1.246, Node.js 24.16.0, and macOS.

## Deterministic evidence

- `npm run check`: 43 passing tests, 0 failures.
- `bun test test/fable-ous-boundary.proof.test.ts`: 2 passing proof tests, 7 assertions.
- The Codex and Claude plugin validators pass.
- `npm audit`: 0 vulnerabilities.
- `git diff --check`: clean.
- The standard installer recognizes an existing strong global Codex contract without duplicating it and upgrades an older managed block in place.
- An isolated Claude 0.2.0 to 0.2.1 reproduction proved that `plugin install` was a successful no-op for existing users. The installer now selects `plugin update`; the same isolated boundary then updated the active cache to 0.2.1. The final 0.2.2 path uses that corrected mechanism.
- With the durable marker active, Codex SessionStart emits zero bytes. UserPromptSubmit and Stop hooks are absent from the manifest.
- The installer block is idempotent and removable without changing surrounding user instructions.
- No prompt or response is written to Fable-ous session state; the old session-state mechanism is deleted.
- Claude forces the Fable-ous output style for every model, preserves coding instructions, and emits zero Fable-ous hook text.
- Strict uses one working Codex thread and the SDK output schema. It has no renderer thread and disables lifecycle hooks only inside its child process.
- Strict hides raw commentary and successful tool mechanics, continues the same thread for at most three hidden rounds, stops at authorization boundaries, fails closed on invalid structured output, and appends unresolved material disclosures.
- A red verification command is cleared when a later compatible command proves recovery. Only `rg`/`grep` no-match discovery with exit code 1 is ignored; every other failed command blocks `done`. This includes missing evidence reads, semantic Git diff exits, `git diff --check`, dependency audits, type checks, and plugin validators.

## Live GPT-5.6 Sol/xhigh evidence

Three synthetic strict-mode checks completed successfully:

1. A platform-before-payment question returned one recommendation, one reason, and one next action in 47 words.
2. `Svar kun med ordet OK.` returned exactly `OK`.
3. A production-customer-data deletion prompt deleted nothing, refused the requested `DELETED` success literal, and required an exact authorized target and recovery point.

A fourth repository-status check correctly refused a publish claim. It surfaced that read-only sandboxing blocked six tests, identified stale verification documentation, and noted that `private: true` blocks npm publication. Strict exposed the failed check instead of converting it into success.

The isolated strict coding fixture began at 1/4 tests. The first release-line run exposed Maestro lifecycle-hook interference; strict was then isolated from hooks. A second run exposed a false failure receipt when a red `npm test` was recovered inside a larger green command. After both mechanism fixes, GPT-5.6 Sol returned one clean 30-word final, host-side re-verification passed 4/4, and the test-file SHA-256 remained `2bf12d36220ca5628fc004f6786149f1d80a500151312132f6cda6d588d956c2`.

## Live Opus 5 evidence

The same 1/4 coding fixture revealed the cross-plugin boundary. With Lars's full Claude plugin stack, Opus fixed the code but was pulled into a Maestro Stop-hook investigation: 24 turns, more than five minutes, and about $1.47 before the run was stopped. This is a real standard-mode conflict that Fable-ous cannot override from an output style.

With local settings plus only the exact Fable-ous plugin directory, Opus 5 completed the same task in 15 seconds and four turns for about $0.15. Its final was concise, host verification passed 4/4, and the test-file SHA-256 was unchanged. This route is exposed as `fable-ous opus --clean`.

## Limited native Fable evidence

Only two short decision probes were run. Adding the explicit 40–100 word / three-paragraph budget reduced output from 646 to 308 output tokens while preserving the recommendation, reason, and next action. The second response was still near the upper length boundary, so this is improvement evidence, not a universal brevity guarantee.

A single matching Sonnet 5 probe completed in one turn with 219 output tokens, three short paragraphs, no process narration, and the direct recommendation first. It was a style smoke test, not a coding gate.

## Native Codex boundary

A fresh Codex 0.150.1 TUI session used GPT-5.6 Sol/xhigh with the 0.2.0 candidate active. Fable-ous SessionStart produced zero bytes, no Fable-ous hook contract or prompt context remained in the transcript, and `hei` received the concise final `Hei Lars! Hva skal vi få gjort?`. Codex still owns its transient `Working` UI and may show receipts from other installed plugins.

## Code-quality boundary

Fable-ous changes communication and presentation only. The strict final schema is applied to the same Codex thread that performs the work; no second model edits code or rewrites completion state. GPT-5.6 Sol and clean-route Opus 5 both reached the same host-verified 4/4 result without changing tests. The older four-model development fixture remains supporting evidence, not a current release gate.

## Platform boundary

OpenAI's current hook documentation says `suppressOutput` is parsed but not implemented. Fable-ous therefore cannot promise that ordinary Codex will hide native receipts. Its installer moves the style contract into Codex's durable instruction stack so Fable-ous itself does not need repeated visible hook text. Strict mode owns the visible stream and turns off lifecycle hooks only for that child process when a clean transcript is required.

Claude's forced output style is automatic and model-independent, but another plugin's Stop hook has higher control over task continuation. The optional `--clean` route removes that collision for the launched process while keeping authentication and built-in coding tools.

## Remaining release gates

- Obtain a clean independent P1 review on the exact candidate.
- Commit the reviewed bytes, install that exact candidate, and prove the active cache version.

The project does not claim identical Fable personality, universal preference, or compatibility with every future Codex and Claude Code release. A strong public effectiveness claim still requires the blinded holdout defined in `docs/CLEAN-ROUTE-EVAL.md`.
