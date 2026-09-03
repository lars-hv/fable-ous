# Fable-ous

Fable-ous is a minimal, reversible presentation preset for native Codex. It makes routine replies warmer, calmer, and outcome-first without changing how Codex chooses work, uses tools, verifies results, handles safety, or decides that work is complete.

The preset deliberately stays small. Model instructions are probabilistic, so Fable-ous does not claim to improve code quality, reasoning, autonomy, or truthfulness. Those remain the responsibility of Codex and the user's existing workflow.

Fable-ous is independent open-source software. It is not affiliated with, endorsed by, or derived from Anthropic or the Claude Fable model. The name describes the intended experience; it does not claim model equivalence.

## Install

```bash
npm install --global github:lars-hv/fable-ous
fable-ous install
```

The npm package is not published yet. The GitHub command installs the public repository directly.

Start a fresh native Codex session:

```bash
codex
```

The default installation is Codex-only. Claude Code is not touched.

## Exactly what it changes

The installer makes three reversible Codex changes:

- sets `personality = "friendly"`;
- sets `hide_agent_reasoning = true`;
- adds this presentation-only block to the user's Codex `AGENTS.md`:

> Lead with the outcome in warm, plain language.
>
> Keep routine replies short, but never omit uncertainty, failures, material caveats, approval boundaries, or missing proof.
>
> This changes presentation only—not work, safety, verification, or completion criteria.

The installer records only the settings and instruction block it owns. `fable-ous style-off` restores prior values when they are still plugin-managed and preserves later user changes.

## What it does not add

Fable-ous adds no:

- lifecycle hooks;
- replacement client or terminal;
- model calls, renderer, or router;
- model-verbosity override;
- autonomy or work-selection rules;
- memory or personal-data collection;
- response linter or word-count enforcement;
- commands or skills.

Native Codex tool receipts remain visible. Another plugin can still display or enforce its own safety and verification behavior.

## Commands

```text
fable-ous install [--with-claude]
fable-ous doctor
fable-ous style-off
```

`doctor` verifies the installed source, active artifact, managed presentation block, native settings, and the absence of hooks or a replacement client.

## Claude Code compatibility

Claude Code compatibility is opt-in through `fable-ous install --with-claude`. It receives the same three-sentence presentation contract as an output style that preserves Claude's coding instructions. Fable-ous does not launch Claude, select a model, or bypass its settings.

## Development

```bash
git clone https://github.com/lars-hv/fable-ous.git
cd fable-ous
npm install
npm run check
bun test test/fable-ous-boundary.proof.test.ts
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/fable-ous
claude plugin validate plugins/fable-ous
```

Private conversations and preference data do not belong in the repository. Public eval cases are synthetic; personal evals belong under the ignored `evals/private/` directory.
