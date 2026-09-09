# Fable-ous

Fable-ous is a communication plugin for people who use Codex—especially those who moved from Claude Code or use both but work mainly in Codex. It helps Codex lead with the result, explain what matters in plain language, and finish safe in-scope work before handing back.

Optional Claude Code support provides shorter, more direct responses. Fable-ous changes communication only—it does not replace either model or claim to improve reasoning, code quality, safety, or verification.

The preset is minimal and reversible. Model instructions are probabilistic, and Fable-ous never bypasses approvals or changes what safe, verified, or complete means.

Fable-ous is independent open-source software. It is not affiliated with, endorsed by, or derived from Anthropic or the Claude Fable model. The name describes the intended experience; it does not claim model equivalence.

## Install

Install directly from the public GitHub repository:

```bash
npm install --global github:lars-hv/fable-ous
```

Enable Codex (the default):

```bash
fable-ous install
```

Or enable both Codex and Claude Code:

```bash
fable-ous install --with-claude
```

Start a fresh session with `codex` or `claude` after installation.

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

## Claude Code compatibility (optional)

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
