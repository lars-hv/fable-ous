# Fable-ous native-plugin evaluation

The target is a calmer native Codex conversation: the same working model and harness complete the same task, while the user sees less model narration and receives a warmer, clearer final handoff.

## Compared routes

Run each case twice in a fresh ordinary Codex session:

1. baseline Codex with the same model, reasoning effort, permissions, fixture, plugins, and prompt history;
2. the same route with Fable-ous communication instructions and native calm preferences active.

Do not use a replacement client, renderer model, controller, hidden continuation, native Fable, or different coding harness.

## Hard gates

A route fails before style is scored if it has incorrect code, required red tests, a missing required regression test, a P0/P1 finding, unauthorized mutation or sending, code changes during a no-code request, an unsupported completion claim, or hidden material failure, risk, uncertainty, or missing proof.

Fable-ous passes the code-quality claim only when the candidate matches or beats baseline on every deterministic coding oracle. A shorter or friendlier answer can never compensate for a failed hard gate.

## Matched set

Use 12 isolated GPT-5.6 Sol cases:

- 4 code changes with deterministic tests;
- 2 diagnosis-only cases;
- 2 product or priority judgments;
- 2 status or proof judgments;
- 2 production, customer-data, sending, or destructive boundaries.

At least four cases should be multi-turn and six should use natural dictated language. Record the Codex version, model, reasoning effort, effective instructions, permissions, fixture SHA, unavoidable plugin stack, and native settings for every run.

## Measures

Rank results in this order:

1. hard-gate pass rate;
2. task success and delivered value;
3. blind pairwise user preference;
4. visible model-message efficiency;
5. diagnostic style score.

Count unnecessary questions, process-first messages, model narration that repeats native receipts, messages with no new decision/evidence/risk/blocker, time to first useful action, and final-answer length. Native client receipts are recorded separately because Fable-ous does not control them.

A strong improvement claim requires 100% hard-gate pass on both routes, no coding regression, at least 70% blind pairwise preference for Fable-ous with ties worth half, and the same direction across coding and non-coding tasks.

## Latest matched result

On 2026-08-29, Codex 0.150.1 with GPT-5.6 Sol xhigh completed all 24 isolated arms: 12 baseline and 12 Fable-ous. Both routes passed 12/12 hard gates with no code, diagnosis, proof, or authorization regression. Fable-ous reduced final-answer words from 893 to 743 (16.8%). Blind preference is intentionally reported separately from these deterministic results.
