# Fable-ous 0.2.9 verification

Fable-ous 0.2.9 is a zero-runtime presentation preset. It keeps the proven installer, rollback, package, and Doctor boundaries while removing every optional model-facing capability except one three-sentence presentation contract.

## Intended effect

The installer applies only:

- `personality = "friendly"`;
- `hide_agent_reasoning = true`;
- a reversible instruction to lead with the outcome, stay concise, preserve material caveats and missing proof, and leave work and completion rules untouched.

It deliberately leaves `model_verbosity` under user control.

## Removed surface

The package contains no response linter, word-count enforcement, command, skill, hook, replacement client, model call, renderer, router, memory, autonomy rule, or work-selection rule.

Claude compatibility consists only of the same three-sentence output style with `keep-coding-instructions: true`. A Codex-only installation is available through `fable-ous install --codex-only`.

## Deterministic gates

`npm run check` validates syntax and all installer, rollback, concurrent-edit, Doctor, artifact-binding, package, and minimal-preset regression tests.

The release path additionally requires:

- `npm run prepublishOnly`;
- Codex and Claude plugin validators;
- the Bun native-plugin boundary proof;
- `npm audit --omit=dev`;
- clean `git diff --check`;
- a cachebusted installation whose active bytes match the candidate;
- `fable-ous doctor` from the installed CLI.

## Honest claim boundary

These checks can establish that the intended small preset is installed, reversible, and free of the removed runtime surfaces. They cannot guarantee identical language from a probabilistic model or prove that users prefer it over standard Codex.

Historical matched evaluations are retained in [CLEAN-ROUTE-EVAL.md](CLEAN-ROUTE-EVAL.md). They explain why 0.2.9 removes global prompt detail and hard response heuristics instead of running another token-heavy prompt-tuning round.
