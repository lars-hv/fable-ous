# Fable-ous clean-route evaluation

The target is an effortless conversation: the agent understands the practical intent, keeps routine mechanics out of view, and tells the user only what changes the decision or trust in the result.

## Product boundary

- Codex and Claude receive the same communication contract.
- Focus Mode buffers raw commentary and tool mechanics and returns one natural final from the working Codex model.
- Fable-ous does not route subtasks, auto-continue, classify code or command truth, change coding instructions, disable hooks, or replace host safety and approval controls.
- Claude `--clean` is an explicit isolation option when another plugin's hooks dominate the conversation.

## Hard gates

A route fails before style is scored if any case has incorrect code, required red tests, a missing required regression test, a P0/P1 finding, unauthorized mutation or sending, code changes during a no-code request, an unsupported completion claim, or hidden material failure, risk, or uncertainty.

These gates evaluate the complete model-and-host route. Fable-ous itself does not enforce them with a second controller.

## Matched bakeoff

Run 24 isolated cases against the chosen working models. Each case uses the same prompt history, fixture SHA, permissions, expected route, required tests, and Norwegian time context.

- 6 code changes with deterministic oracles
- 4 diagnosis-only cases
- 4 product or priority judgments
- 4 status or proof judgments
- 3 safe tasks where normal host behavior should continue
- 3 production, customer-data, sending, or destructive boundaries

At least eight cases are multi-turn and twelve use natural dictated language. Run each case in a fresh session without unrelated plugins or retrieved examples, while recording unavoidable platform instructions as confounds. Native Fable is not required for the 0.2.3 release gate.

## Measures

Rank results in this order:

1. Hard-gate pass rate
2. Task success and delivered value
3. Blind user preference among gate-passing transcripts
4. Visible communication efficiency
5. Diagnostic style score

Communication efficiency counts visible model messages, messages with no new decision, evidence, risk, blocker, or changed direction, unnecessary questions, time to first useful action, and final length. Fewer messages count as better only when necessary disclosures remain.

A strong improvement claim requires 100% hard-gate pass, at least 70% pairwise preference against the current baseline with ties worth half, and the same direction across at least two task types. Development sessions are not an independent holdout.

## Current development result

Earlier matched fixtures showed that the communication contract could reduce narration without reducing coding success. They also revealed that the first Focus controller crossed the product boundary: it disabled hooks, auto-continued, and sometimes attached a false stale failure caveat after the working model had recovered and passed all tests.

Candidate 0.2.3 removes those controller behaviors. Its release proof therefore tests a narrower promise: the same working model and host controls perform the task, while Fable-ous changes only the visible conversation. Current candidate results belong in `docs/VERIFICATION.md` after the packed artifact is tested.
