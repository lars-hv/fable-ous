# Fable-ous verification

Candidate 0.2.3 was prepared on 2026-08-28 with Codex CLI 0.150.1, `@openai/codex-sdk` 0.150.1, Claude Code 2.1.246, Node.js 24.16.0, and macOS.

## Current architecture boundary

Fable-ous is a communication layer. Focus Mode performs exactly one normal working-model turn and returns its latest natural final answer. It does not request a structured state envelope, auto-continue the thread, classify command failures, append caveats, disable hooks, or run a renderer model.

The working Codex model keeps its normal tools, plugins, lifecycle hooks, safety rules, approval boundaries, and coding workflow. Focus Mode buffers routine commentary and tool mechanics from the visible terminal. A real SDK turn failure exits as an error. Whether code is correct or work is complete remains the responsibility of Codex and the host's existing controls, not a second Fable-ous controller.

## Deterministic evidence

- The complete Node test and syntax suite passes: 34/34 tests.
- The Bun customer-boundary proof passes: 2/2 tests with 8 assertions.
- Both plugin validators pass.
- `npm audit` reports zero vulnerabilities.
- `git diff --check` is clean.
- Focus Mode is the default CLI route; `strict` remains a backwards-compatible alias.
- The publish gate runs the complete check, both plugin validators, and a package-content allowlist before npm can publish.
- Tests prove that Focus calls the working model once without an output schema, ignores raw command and file events, returns the latest natural model message unchanged, preserves authorization language, and surfaces real turn failures.
- Tests prove that Fable-ous does not override Codex features, hooks, sandbox, or approval defaults and that its installed communication contract explicitly leaves coding workflow and completion judgment to the host.
- The installer upgrades an older managed instruction block in place, remains idempotent, and removes only its own block on uninstall.
- Codex has no per-prompt or Stop hook. Claude forces the Fable-ous output style while preserving coding instructions.

The packed 0.2.3 candidate was installed without `npm link` into isolated Codex roots. Doctor reported the durable style active and per-turn hooks silent; the installed plugin cache was byte-identical to the packed plugin source. The npm publish dry-run contained 23 allowlisted files and preserved the public CLI binary.

## Live model evidence

Earlier GPT-5.6 Sol development runs proved that the style could produce concise, outcome-first answers and that Sol could move the synthetic coding fixture from 1/4 to 4/4 without changing its test file. Those runs also exposed the decisive design flaw in the earlier controller: Fable-ous sometimes appended a false failure caveat after Sol had recovered a red test and reached 4/4.

Candidate 0.2.3 removes that controller mechanism instead of adding more command-classification patches. A fresh packed-candidate Sol style probe returned one direct recommendation, one reason, and one concrete next action in three short paragraphs.

On the tracked synthetic coding fixture, packed-candidate Sol moved from 1/4 to 4/4 and preserved the test-file SHA-256 `2bf12d36220ca5628fc004f6786149f1d80a500151312132f6cda6d588d956c2`. Its natural final also reported that Maestro could not persist an external receipt from the configured workspace sandbox. Focus returned that host judgment unchanged; it neither hid the blocker nor appended its own caveat. This is a host-integration limitation, not a failed code oracle.

No native Fable run is part of this release gate.

Historical Opus and native-Fable experiments remain development context only. They are not proof of the current 0.2.3 Focus boundary and are not required for publication.

## Platform boundary

OpenAI's standard Codex interface owns its native tool receipts, so the durable instruction layer cannot guarantee a receipt-free standard session. Focus Mode can hide those mechanics because it owns its own terminal presentation, but it intentionally does not suppress or disable the underlying hooks and plugins.

Claude's forced output style is automatic and model-independent, but it cannot cancel another plugin's hooks. The optional `--clean` route isolates the launched Claude process and therefore also omits user/project settings, including permissions, MCP servers, and safety hooks defined there. It remains an explicit opt-in.

The project does not claim identical Fable personality, universal preference, or compatibility with every future Codex and Claude Code release. A strong public effectiveness claim still requires the blinded holdout defined in `docs/CLEAN-ROUTE-EVAL.md`.
