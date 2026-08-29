# Fable-ous

Fable-ous makes native Codex feel calmer, warmer, clearer, and more useful to a human. It changes how Codex speaks to you, not how it reasons, writes code, runs tools, tests work, or decides whether a task is complete.

The product is deliberately small: install the plugin, then keep using ordinary `codex`. There is no replacement terminal, SDK client, renderer model, controller, model router, or hidden continuation loop.

Fable-ous is independent open-source software. It is not affiliated with, endorsed by, or derived from Anthropic or the Claude Fable model. The name describes the intended experience; it does not claim model equivalence.

## Install

```bash
npm install --global fable-ous@latest
fable-ous install
```

Start a fresh native Codex session:

```bash
codex
```

The `fable-ous install` step is required. Codex plugins do not currently provide an automatic output-style surface equivalent to Claude Code's forced output style, so the installer applies the reversible global Codex communication block and native settings.

The installer also adds the compatible Claude Code output style when Claude Code is available. Use `fable-ous install --codex-only` for Codex only.

## What it changes

Fable-ous uses only supported host controls:

- one reversible communication block in the user's global Codex `AGENTS.md`;
- native `personality = "friendly"`;
- native `hide_agent_reasoning = true`;
- no lifecycle hooks, so Fable-ous contributes no hook-status receipts;
- a forced Claude Code output style that preserves Claude's coding instructions.

The communication contract asks the working model to understand the practical intent, do all necessary work, explain the result in human terms, make completion clear, include the proof that creates trust, and omit internal process noise. It does not impose a word limit; a complete answer is better than a short vague receipt.

### The human-usefulness standard

A good handoff lets the user understand five things without asking another question:

1. What actually happened, in ordinary language?
2. Is the requested outcome finished, partly finished, or blocked?
3. What changed for the user, and why does it matter?
4. What concrete evidence makes that conclusion trustworthy?
5. What material risk or missing proof remains, and what is the one next action if anything remains?

This is an internal quality standard, not a fixed receipt format. Tone should feel warm and adult-to-adult; detail should be translated into consequences; length should expand when understanding or trust needs it and contract when it does not.

The installer records only the settings it owns. `fable-ous style-off` restores the prior values when they are still plugin-managed and preserves settings the user changed after installation.

## What it does not change

Fable-ous does not change the selected model, reasoning effort, verbosity preference, code path, tools, plugins, hooks, sandbox, approvals, safety rules, tests, or completion judgment.

Codex itself owns native command, file, search, and tool receipts. The current plugin API cannot hide those receipts. Fable-ous reduces model narration and hides supported reasoning events, but it does not patch or rebuild the Codex interface.

Another installed plugin can still show hook statuses or block and replace a final answer. Fable-ous deliberately does not override another plugin's safety or verification hooks; `fable-ous doctor` reports this boundary.

Because model language is probabilistic, Fable-ous can guarantee installation and native configuration, not identical wording or personality on every turn. Strong style claims require the matched evaluation in [docs/CLEAN-ROUTE-EVAL.md](docs/CLEAN-ROUTE-EVAL.md), with code and safety as hard gates.

## Claude compatibility

Claude Code receives the same communication contract through a forced output style with `keep-coding-instructions: true`. Fable-ous does not launch Claude, select a model, remove other plugins, or bypass user/project settings.

## Commands

```text
fable-ous install [--codex-only]
fable-ous doctor
fable-ous style-off
fable-ous lint < response.txt
```

`style-off` removes the reversible Codex `AGENTS.md` block and restores the native Codex settings Fable-ous owned. Claude Code's output style belongs to its installed plugin; disable it with `claude plugin disable fable-ous@fable-ous --scope user`, or remove it with `claude plugin uninstall fable-ous@fable-ous --scope user`.

Running `fable-ous` without a command explains the native plugin flow; it never starts another Codex client.

## Development

```bash
git clone https://github.com/lars-hv/fable-ous.git
cd fable-ous
npm install
npm link
fable-ous install
npm run check
bun test test/fable-ous-boundary.proof.test.ts
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/fable-ous
claude plugin validate plugins/fable-ous
```

Private conversations and preference data do not belong in the repository. Public eval cases are synthetic; personal evals belong under the ignored `evals/private/` directory.
