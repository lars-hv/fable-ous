# Fable-ous native-plugin evaluation

The target is a more human-useful native Codex conversation: the same working model and harness complete the same task, while the user receives a warmer, clearer handoff that answers the practical question without follow-up.

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
4. no-follow-up-needed score;
5. visible model-message efficiency;
6. diagnostic style score.

Score each handoff on nine human-usefulness dimensions:

1. **Intent:** it solves the practical need, not merely the literal wording.
2. **Work integrity:** it performs the inspection, implementation, research, or verification the task requires instead of optimizing for a tidy answer.
3. **Outcome:** the user can tell what actually happened.
4. **Completion:** finished, partly finished, blocked, and not yet verified are natural and unambiguous.
5. **User effect:** it explains what changed for the user and why it matters.
6. **Trust:** it gives proportionate concrete evidence without dumping internal mechanics.
7. **Honesty:** it preserves material risk, uncertainty, authorization boundaries, and missing proof.
8. **Relevance:** every visible message adds a result, decision, changed understanding, risk, blocker, or useful proof rather than repeating native receipts.
9. **Voice:** it is warm, plain, adult-to-adult, decisive, and uses the length needed for understanding.

Then count unnecessary questions, process-first messages, model narration that repeats native receipts, messages with no new decision/evidence/risk/blocker, time to first useful action, and final-answer length. The primary owner metric is whether an obvious follow-up is required to understand the result. Length is diagnostic only, never the objective. Native client receipts are recorded separately because Fable-ous does not control them.

A strong improvement claim requires 100% hard-gate pass on both routes, no coding regression, at least 70% blind pairwise preference for Fable-ous with ties worth half, and the same direction across coding and non-coding tasks.

## Previous matched baseline

On 2026-08-29, Codex 0.150.1 with GPT-5.6 Sol xhigh completed all 24 isolated arms: 12 baseline and 12 Fable-ous. Both routes passed 12/12 hard gates with no code, diagnosis, proof, or authorization regression. The pre-0.2.5 Fable contract reduced final-answer words from 893 to 743 (16.8%). Blind preference is intentionally reported separately from these deterministic results.

The first randomized blind preference pass selected Fable-ous in 7/12 pairs (58.3%) and baseline in 5/12. That is below the 70% claim gate. Root-cause review found that the brevity-first contract could suppress useful inspection and compress away decisive evidence. The contract and rubric now prioritize human usefulness, complete work, clear completion, user effect, proof, and no-follow-up-needed over word count. All prior word-count, preference, and unchanged-quality numbers are historical until the revised contract passes a fresh matched run.

A focused post-revision falsifier then tested whether the communication contract itself discouraged optional evidence discovery. In three matched baseline runs and three current-Fable runs, neither route opened the available customer-context file; all six answers were otherwise direct, useful, quiet, and required no obvious explanatory follow-up. Mean final length was 58.0 words for baseline and 60.7 for Fable. This is evidence against a large Fable-specific regression, not proof of equivalence: both groups hit the same zero-inspection floor. A separate three-run `model_verbosity = "medium"` probe used the decisive customer facts only once, so native verbosity is not the root-cause control for evidence discovery.

## Current 0.2.6 matched result

The current communication contract completed a fresh 12-case / 24-arm run on Codex 0.150.1 with GPT-5.6 Sol xhigh. Baseline and Fable-ous both passed 12/12 hard gates. Baseline used 890 final-answer words and Fable-ous used 999; length was not optimized. An exact Claude Opus 5 blind judge chose Fable-ous in 7 pairs, baseline in 3, and tied 2, for a tie-adjusted Fable score of 66.7%. This is better than the historical 58.3% result but remains below the 70% claim gate.

One follow-up experiment added a stronger instruction to cite decisive facts and caveats. Hard gates again stayed 12/12 on both routes, but blind preference fell to 33.3% (3 Fable, 7 baseline, 2 ties). That added instruction was therefore removed. It is falsifying evidence against more prompt tuning, not a result for the release contract.

Conclusion: 0.2.6 has current evidence of no deterministic task-quality regression in this matched set and one encouraging preference result, but it has not proved a stable or 10x conversational advantage. Further progress should come from broader real-work observation, not more global prompt text.
