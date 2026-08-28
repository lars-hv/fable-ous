# Fable-ous

Fable-ous makes GPT-5.6 Sol feel more like Fable in conversation: calmer, warmer, less technical, and more decisive. It changes communication, not the underlying model or coding behavior.

It is built for people who want Codex to understand the practical intent, lead with the result, avoid process narration, and give one useful recommendation in plain language. Claude Code is supported through the same communication contract, but Codex is the primary experience.

Its progress rule is a quiet pulse: the client may keep showing its normal tool receipts, while the model speaks only when a finding, risk, blocker, decision, or direction materially changes. It does not repeat shell counts or running-job inventories.

Fable-ous is independent open-source software. It is not affiliated with, endorsed by, or derived from Anthropic or the Claude Fable model. The name describes the intended experience; it does not claim model equivalence.

## Install

```bash
npm install --global fable-ous@latest
fable-ous install
```

Focus Mode is the default Fable-ous experience. Start it in a fresh terminal:

```bash
fable-ous
```

It keeps the working Codex model and tools, but owns the visible conversation so successful tool mechanics and raw process narration stay hidden. GPT-5.6 Sol is the primary tested route.

## Focus Mode — default

Focus Mode runs through the official Codex SDK. It shows a temporary in-place activity indicator while Codex works, hides raw commentary and tool mechanics, and then shows the working model's natural final answer.

There is no second renderer model, structured status controller, or hidden continuation loop. Focus Mode does not classify command results, append its own caveats, decide whether work is done, or reinterpret the model's judgment. A real SDK turn failure still exits as an error; failures, uncertainty, missing proof, risk, and authorization boundaries otherwise remain the working model's responsibility under the normal Codex instruction and safety stack.

```bash
fable-ous focus --cwd /path/to/project
```

`fable-ous strict` remains available as a backwards-compatible alias.

For one prompt:

```bash
fable-ous ask "Give me the direct recommendation" --cwd /path/to/project
```

Focus Mode preserves the user's existing Codex authentication. It uses `model_verbosity=low`, `personality=none`, and the user's current model unless `--model` is provided. Unless explicitly set on the command line, sandbox and approval behavior remain the host defaults. Normal Codex tools, plugins, lifecycle hooks, safety rules, approval boundaries, and coding workflow remain active. Communication shaping does not alter the patch or run a second coding model.

## Compatibility mode

Running normal `codex` after installation still applies the quieter Fable-ous conversation style, but the native Codex client continues to show its own tool receipts and interface. Use Focus Mode when you want only material messages and the final answer.

The installer adds one reversible Fable-ous block to the user's global Codex `AGENTS.md`, or recognizes an existing contract that already covers the same behavior. Codex then receives the style through its normal instruction stack with no per-prompt hook text. The plugin records only that the durable layer is active; it never stores prompts or responses.

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

`--clean` starts Claude with local settings plus the exact Fable-ous plugin directory. Authentication and Claude's built-in coding tools remain, but user/project settings are intentionally omitted — including permissions, MCP servers, and safety hooks defined there. Use it only when that isolation is acceptable; standard launchers preserve the user's normal plugin stack and safety controls.

## What the standard plugin cannot do

Codex lifecycle hooks can add developer context, but they cannot retract text already streamed by the standard Codex interface. Codex also controls its own native tool receipts. Another installed plugin can still inject its own dialog or Stop-hook loop. The durable instruction layer removes Fable-ous's repeated hook dialogs; use Focus Mode when raw model commentary and successful tool mechanics must stay hidden.

Claude has the same cross-plugin boundary: the forced output style shapes the model, but cannot cancel a higher-priority hook from another plugin. Use a `--clean` Claude launcher when that happens.

## Claude's built-in controls

Claude Code includes `Concise` and `Proactive` output styles. Fable-ous focuses only on the presentation side: plain founder-facing language, selective technical detail, and one clear recommendation. It does not change Claude's knowledge, coding instructions, or task controller.

## Honest guarantees

Fable-ous can deterministically guarantee a durable Codex communication layer after its installer runs, no per-prompt or Stop hooks, a forced Claude output style with coding instructions preserved, and hidden raw commentary and tool mechanics in Focus Mode. Focus Mode returns one natural final from the working model and does not run a controller or renderer model.

It cannot guarantee identical model personality, hide native receipts in ordinary Codex, overrule another plugin's hooks, correct a model's mistaken completion claim, or remain compatible with future client changes without updates. Focus Mode intentionally trusts the working model and host controls instead of independently judging code or test truth. Public claims should be based on the included tests and versioned compatibility checks, not "works for everyone."

Verified locally with Codex CLI 0.150.1, `@openai/codex-sdk` 0.150.1, Claude Code 2.1.246, and Node.js 24.16.0 on macOS. Claude Code 2.1.237 or newer is recommended for the current output-style controls.

The implementation follows the current official contracts for [Codex hooks](https://learn.chatgpt.com/docs/hooks), the [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [Claude Code hooks](https://code.claude.com/docs/en/hooks), and [Claude Code output styles](https://code.claude.com/docs/en/output-styles).

See the dated [verification report](docs/VERIFICATION.md) for live-test evidence and known limits, and the [clean-route evaluation](docs/CLEAN-ROUTE-EVAL.md) for the cross-model quality gate.

## Commands

```text
fable-ous [--cwd PATH] [--model MODEL] [--effort LEVEL]
fable-ous focus [--cwd PATH] [--model MODEL] [--effort LEVEL]
fable-ous install [--codex-only]
fable-ous style-off
fable-ous doctor
fable-ous strict [--cwd PATH] [--model MODEL] [--effort LEVEL]  # legacy alias
fable-ous ask "PROMPT" [--cwd PATH] [--model MODEL]
fable-ous opus [--clean] [...CLAUDE_ARGS]
fable-ous fable [--clean] [...CLAUDE_ARGS]
fable-ous claude --model MODEL [--clean] [...CLAUDE_ARGS]
fable-ous lint < response.txt
```

## Development

```bash
git clone https://github.com/lars-hv/fable-ous.git
cd fable-ous
npm install
npm link
fable-ous install
npm test
npm run check
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/fable-ous
claude plugin validate plugins/fable-ous
```

Private conversations and preference data do not belong in the repository. The public eval cases are synthetic; personal evals belong under the ignored `evals/private/` directory.
