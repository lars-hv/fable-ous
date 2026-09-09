# Fable-ous 0.2.11 verification

Fable-ous is a zero-runtime conversation preset. It keeps the proven installer, rollback, package, and Doctor boundaries. Codex receives the communication-and-handoff contract; optional Claude compatibility uses a separate concise output style.

## Intended effect

The installer applies only:

- `personality = "friendly"`;
- `hide_agent_reasoning = true`;
- a reversible instruction to speak naturally at the user's level, preserve material evidence and risk, and finish safe in-scope work before handing back;
- an explicit guard that code quality, safety, verification, and completion requirements remain unchanged.

It deliberately leaves `model_verbosity` under user control.

## Removed surface

The package contains no response linter, word-count enforcement, command, skill, hook, replacement client, model call, renderer, router, memory, general autonomy policy, approval bypass, or work-selection machinery.

The default install is Codex-only and does not touch Claude Code. Optional Claude compatibility requires the explicit `fable-ous install --with-claude` flag and consists only of a short, direct output style based on Claude Code's native Concise pattern, with `keep-coding-instructions: true`. It does not change Claude's model, effort, permissions, memory, reasoning, code-quality, safety, or verification controls.

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

Historical matched evaluations are retained in [CLEAN-ROUTE-EVAL.md](CLEAN-ROUTE-EVAL.md). They explain why Fable-ous avoids global prompt detail and hard response heuristics instead of running another token-heavy prompt-tuning round.
