# Fable-ous

Fable-ous makes Codex and Claude Code models communicate with more clarity, judgment, compression, and forward motion.

It is built for people who want the agent to lead with the result, infer the likely goal, avoid process narration, continue through safe reversible work, and stop only at a real decision boundary.

Its progress rule is a quiet pulse: the client may keep showing its normal tool receipts, while the model speaks only when a finding, risk, blocker, decision, or direction materially changes. It does not repeat shell counts or running-job inventories.

Fable-ous is independent open-source software. It is not affiliated with, endorsed by, or derived from Anthropic or the Claude Fable model. The name describes the intended experience; it does not claim model equivalence.

## Two modes

### Standard plugin

The installer adds one reversible Fable-ous block to the user's global Codex `AGENTS.md`, or recognizes an existing contract that already covers the same behavior. Codex then receives the style through its normal instruction stack with no per-prompt hook text. The plugin records only that the durable layer is active; it never stores prompts or responses.

```bash
git clone https://github.com/lars-hv/fable-ous.git
cd fable-ous
npm install
npm link
fable-ous install
```

Start a fresh Codex or Claude Code session after installation.

When the durable Codex layer is active, the Codex hook emits no text. A plugin-only install that has not run `fable-ous install` falls back to one compact SessionStart line so the plugin still improves behavior. Fable-ous intentionally has no UserPromptSubmit or Stop hook.

Remove only the managed instruction block without touching other user instructions:

```bash
fable-ous style-off
```

Fable-ous is always active in Codex. In Claude Code, the SessionStart hook uses the model identifier when Claude provides it: Opus, Sonnet, and other non-Fable models receive the full communication contract. Native Fable receives only the small quiet-pulse contract, preserving its own voice while reducing duplicate progress narration. If Claude omits its model identifier, Fable-ous fails closed and stays off. The bundled Claude output style is available as a manual override but is not forced.

Claude Code 2.1.246 omitted the optional `model` hook field in a real `--model claude-opus-5` run. For guaranteed no-settings activation, launch Opus through Fable-ous:

```bash
fable-ous opus
```

Normal Claude arguments pass through:

```bash
fable-ous opus -p "Give me the direct recommendation"
fable-ous fable
fable-ous claude --model claude-sonnet-5
```

The Fable launcher explicitly selects the quiet-pulse profile; it does not add the renderer or full imitation contract. The generic launcher refuses to guess a model. If you change models inside Claude Code with `/model`, start a new wrapper session; later hooks do not reliably expose model changes.

### Strict mode

Strict mode runs through the official Codex SDK. It hides raw model commentary and successful tool mechanics, shows a temporary in-place activity indicator, and keeps only material failure pulses plus the final answer.

There is no second renderer model. The working Codex model performs the task and returns its own user-visible answer through a structured final envelope. Material failures, uncertainty, missing proof, risk, and authorization boundaries are audited separately; if the natural answer omits one, the client appends it instead of polishing it away. This removes the old rewrite boundary and its extra model turn.

```bash
fable-ous strict --cwd /path/to/project
```

For one prompt:

```bash
fable-ous ask "Give me the direct recommendation" --cwd /path/to/project
```

Strict mode preserves the user's existing Codex authentication. It uses `model_verbosity=low`, `personality=none`, and the user's current model unless `--model` is provided. Communication shaping does not alter the patch or run a second coding model.

## What the standard plugin cannot do

Codex lifecycle hooks can add developer context, but they cannot retract text already streamed by the standard Codex interface. Codex also controls its own native tool receipts. The durable instruction layer removes Fable-ous's repeated hook dialogs; use strict mode when raw model commentary and successful tool mechanics must stay hidden.

## Claude's built-in controls

Claude Code includes `Concise` and `Proactive` output styles. Concise reduces preamble and narration; Proactive favors action over routine questions. Fable-ous combines those useful behaviors with plain founder-facing language, selective technical detail, real decision boundaries, and preservation of proof. It does not change Claude's knowledge or coding instructions.

## Honest guarantees

Fable-ous can deterministically guarantee a durable Codex instruction layer after its installer runs, no per-prompt or Stop hooks, full-versus-quiet routing when Claude reports its model, and hidden raw commentary in Codex strict mode. Strict uses the working model's own structured final and preserves detected failed-tool disclosures.

It cannot guarantee identical model personality, hide native receipts in ordinary Codex, detect every mid-session Claude model switch, understand every semantic omission deterministically, or remain compatible with future client changes without updates. Public claims should be based on the included tests and versioned compatibility checks, not "works for everyone."

Verified locally with Codex CLI 0.150.1, `@openai/codex-sdk` 0.150.1, Claude Code 2.1.246, and Node.js 24.16.0 on macOS. Claude Code 2.1.237 or newer is recommended for the current output-style controls.

The implementation follows the current official contracts for [Codex hooks](https://learn.chatgpt.com/docs/hooks), the [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [Claude Code hooks](https://code.claude.com/docs/en/hooks), and [Claude Code output styles](https://code.claude.com/docs/en/output-styles).

See the dated [verification report](docs/VERIFICATION.md) for live-test evidence and known limits, and the [clean-route evaluation](docs/CLEAN-ROUTE-EVAL.md) for the cross-model quality gate.

## Commands

```text
fable-ous install [--codex-only]
fable-ous style-off
fable-ous doctor
fable-ous strict [--cwd PATH] [--model MODEL] [--effort LEVEL]
fable-ous ask "PROMPT" [--cwd PATH] [--model MODEL]
fable-ous opus [...CLAUDE_ARGS]
fable-ous fable [...CLAUDE_ARGS]
fable-ous claude --model MODEL [...CLAUDE_ARGS]
fable-ous lint < response.txt
```

## Development

```bash
npm test
npm run check
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/fable-ous
claude plugin validate plugins/fable-ous
```

Private conversations and preference data do not belong in the repository. The public eval cases are synthetic; personal evals belong under the ignored `evals/private/` directory.
