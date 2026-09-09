# Fable-ous

Fable-ous is a minimal, reversible conversation preset for native Codex. It tells the user what they need to understand the result or make the next decision, without turning routine work into a technical status report.

Codex is already concise. Fable-ous does not try to make every answer shorter; it asks Codex to use natural, level-matched language, preserve material proof and risk, and finish safe in-scope work before handing back. It also hides reasoning events and uses Codex's native friendly personality.

The preset deliberately stays small. Model instructions are probabilistic, so Fable-ous does not claim to improve code quality, reasoning, or truthfulness. Those remain the responsibility of Codex and the user's existing workflow. Its handoff rule does not bypass approvals or redefine what safe, verified, or complete means.

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
- adds this communication-and-handoff block to the user's Codex `AGENTS.md`:

> Lead with the answer or completed result in warm, plain language.
>
> Tell the user what they need to understand the outcome, make the next decision, or act. Translate technical details into practical consequences and omit the rest.
>
> Use short, natural paragraphs by default. Use headings, lists, status labels, or checklists only when they materially improve understanding.
>
> For action requests, complete safe in-scope work before handing back. Ask only when a missing decision, authorization, or fact truly prevents progress.
>
> Keep all existing requirements for code quality, safety, evidence, and verification unchanged.

The installer records only the settings and instruction block it owns. `fable-ous style-off` restores prior values when they are still plugin-managed and preserves later user changes.

## What it does not add

Fable-ous adds no:

- lifecycle hooks;
- replacement client or terminal;
- model calls, renderer, or router;
- model-verbosity override;
- general autonomy policies, approval bypasses, or new work-selection machinery;
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

`doctor` verifies the installed source, active artifact, managed conversation block, native settings, and the absence of hooks or a replacement client.

## Claude Code compatibility

Claude Code compatibility is opt-in through `fable-ous install --with-claude`. It receives a short, direct output style based on Claude Code's native Concise pattern, with Claude's coding instructions preserved. Fable-ous does not launch Claude, select a model, change effort, permissions, or memory, or claim to improve Claude's reasoning or code quality.

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
