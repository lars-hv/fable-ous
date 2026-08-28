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

Fable-ous is always active in Codex after installation. In Claude Code, the plugin forces its bundled output style while preserving Claude's coding instructions. This works independently of the optional hook model identifier and applies the same quiet communication contract to Opus, Sonnet, Fable, and later model switches. Claude hooks emit no Fable-ous context or receipt text.

The Claude launchers are optional model-selection shortcuts, not activation requirements:

```bash
fable-ous opus
```

Normal Claude arguments pass through:

```bash
fable-ous opus -p "Give me the direct recommendation"
fable-ous fable
fable-ous claude --model claude-sonnet-5
```

The generic launcher refuses to guess a model. Changing models inside Claude Code does not require restarting Fable-ous because style activation belongs to the plugin, not model detection.

If another Claude plugin's hooks keep reopening or narrating the task, use the clean route:

```bash
fable-ous opus --clean
```

`--clean` starts Claude with local settings plus the exact Fable-ous plugin directory, omitting user/project plugin settings for that process. Authentication and Claude's built-in coding tools remain. This is an explicit isolation mode; standard launchers preserve the user's normal plugin stack.

### Strict mode

Strict mode runs through the official Codex SDK. It hides raw model commentary and successful tool mechanics, shows a temporary in-place activity indicator, and keeps only material failure pulses plus the final answer.

There is no second renderer model. The working Codex model performs the task and returns its own user-visible answer through a structured final envelope. If safe in-scope work remains, strict mode keeps the intermediate receipt hidden and continues the same thread for up to three bounded turns. It ends only as `done`, at a real `blocked` boundary with the exact next action, or with an honest not-complete result when the continuation budget is exhausted.

Material failures, uncertainty, missing proof, risk, and authorization boundaries are audited separately; if the natural answer omits one, the client appends it instead of polishing it away. A blocking disclosure cannot be returned as `done`.

```bash
fable-ous strict --cwd /path/to/project
```

For one prompt:

```bash
fable-ous ask "Give me the direct recommendation" --cwd /path/to/project
```

Strict mode preserves the user's existing Codex authentication. It uses `model_verbosity=low`, `personality=none`, and the user's current model unless `--model` is provided. It disables lifecycle hooks only inside its child Codex process so another plugin cannot reopen the hidden final; installed plugins and persistent Codex configuration are not changed. Communication shaping does not alter the patch or run a second coding model.

## What the standard plugin cannot do

Codex lifecycle hooks can add developer context, but they cannot retract text already streamed by the standard Codex interface. Codex also controls its own native tool receipts. Another installed plugin can still inject its own dialog or Stop-hook loop. The durable instruction layer removes Fable-ous's repeated hook dialogs; use strict mode when raw model commentary and successful tool mechanics must stay hidden.

Claude has the same cross-plugin boundary: the forced output style shapes the model, but cannot cancel a higher-priority hook from another plugin. Use a `--clean` Claude launcher when that happens.

## Claude's built-in controls

Claude Code includes `Concise` and `Proactive` output styles. Concise reduces preamble and narration; Proactive favors action over routine questions. Fable-ous combines those useful behaviors with plain founder-facing language, selective technical detail, real decision boundaries, and preservation of proof. It does not change Claude's knowledge or coding instructions.

## Honest guarantees

Fable-ous can deterministically guarantee a durable Codex instruction layer after its installer runs, no per-prompt or Stop hooks, a forced Claude output style with coding instructions preserved, and hidden raw commentary in Codex strict mode. Strict uses the working model's own thread, bounds hidden continuation, preserves detected failed-tool disclosures, and rejects `done` when a blocking disclosure remains.

It cannot guarantee identical model personality, hide native receipts in ordinary Codex, overrule another plugin's hooks in standard mode, understand every semantic omission deterministically, or remain compatible with future client changes without updates. Standard mode influences model behavior; Codex strict mode and Claude `--clean` are the stronger isolation boundaries. Public claims should be based on the included tests and versioned compatibility checks, not "works for everyone."

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
fable-ous opus [--clean] [...CLAUDE_ARGS]
fable-ous fable [--clean] [...CLAUDE_ARGS]
fable-ous claude --model MODEL [--clean] [...CLAUDE_ARGS]
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
