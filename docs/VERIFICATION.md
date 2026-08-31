# Fable-ous verification

Candidate 0.2.6 is a native-plugin-only release. The separate Focus/Strict Codex SDK client, prompt runner, model launchers, clean-route wrapper, and `@openai/codex-sdk` dependency have been removed.

## Product boundary

Fable-ous shapes communication through the normal Codex instruction stack and supported native settings. It does not own the terminal stream, start a second client, route work, auto-continue, classify command truth, change coding instructions, or replace host safety and approval controls.

The installer applies two reversible native preferences:

- `personality = "friendly"`
- `hide_agent_reasoning = true`

The installer deliberately leaves `model_verbosity` to the user. The preferences and communication contract affect presentation. Model choice, reasoning effort, tools, plugins, hooks, sandbox, approvals, coding, testing, verification, and completion judgment remain native Codex responsibilities.

## Deterministic release gates

Portable CI and `npm run check` enforce JavaScript syntax, Node tests, native-plugin boundary assertions, version alignment, package contents, dependency audit, and the absence of the replacement client and lifecycle hooks.

The release operator additionally requires:

- Bun native-plugin boundary proof;
- Codex and Claude plugin validators;
- clean `git diff --check`;
- a cachebusted installed plugin whose runtime bytes match the source candidate;
- fresh-session doctor evidence.

The tests cover reversible instruction installation without a full `AGENTS.md` backup, native preference installation and restoration, rollback-evidence validation, user changes made after installation, the absence of lifecycle hooks, forced Claude output style with coding instructions preserved, CLI installation/update behavior, installed-artifact binding in Doctor, package boundaries, and the absence of a replacement Codex runtime.

## Existing model evidence

Earlier Sol runs showed that the communication contract can produce outcome-first answers and that a synthetic coding fixture can move from 1/4 to 4/4 while preserving the test-file SHA-256. Those runs are encouraging code-quality evidence, but some used the removed Focus presentation path and therefore do not prove the 0.2.6 native-plugin experience.

The previous native Codex 0.150.1 / GPT-5.6 Sol xhigh evaluation established a compatibility baseline for the pre-0.2.5 contract:

- a no-tool product judgment returned one direct recommendation and one concrete next step in two short paragraphs;
- the finite-average fixture moved from 1/4 to 4/4 tests with a minimal implementation change;
- the test file remained byte-identical with SHA-256 `2bf12d36220ca5628fc004f6786149f1d80a500151312132f6cda6d588d956c2`;
- host rerun confirmed 4/4 after the model turn.

The same coding probe exposed an external-harness confound: Maestro's Stop hook replaced Sol's concise successful final with `NOT VERIFIED` because the isolated fixture was not a tracked Git repository. This did not change the code or test result, but it proved that a separate blocking Stop hook could override Fable-ous presentation. The Maestro 0.47.70 candidate removes that generic completion hook from both clients while retaining action-boundary safety.

That matched A/B passed all 12/12 hard gates on both routes across four code tasks, two diagnoses, two product judgments, two proof judgments, and two irreversible-action boundaries. There were no harness failures. The older Fable contract used 743 final words versus 893 for baseline, a 16.8% reduction, and a randomized blind preference pass selected Fable-ous in 7/12 pairs (58.3%). Its losses showed that word reduction was the wrong primary objective: one answer skipped useful inspection, while another compressed away decisive evidence.

The current 0.2.6 communication contract has now completed the same 12-case / 24-arm native run: both routes again passed 12/12 hard gates. Baseline used 890 final-answer words and Fable-ous used 999. An exact Claude Opus 5 blind judge chose Fable-ous 7 times, baseline 3 times, and tied 2, a tie-adjusted 66.7%. That is encouraging but below the 70% improvement gate. A one-sentence evidence-grounding experiment kept both hard gates at 12/12 but scored only 33.3%; the sentence was removed. The release therefore claims compatibility and a communication preference, not proven stable superiority or lower token use.

The revised contract was also tested against the strongest suspected regression: making Sol less likely to inspect useful optional evidence. Three matched baseline runs and three current-Fable runs used the same Codex 0.150.1, GPT-5.6 Sol xhigh, friendly personality, resolved low verbosity, isolated fixture, and prompt. Both routes opened the available customer-context file 0/3 times, while all six final answers remained direct, useful, quiet, and left no obvious explanatory follow-up. Mean final length was 58.0 baseline words and 60.7 Fable words. This rules out an obvious Fable-only suppression in that probe, but the shared zero-inspection floor means it does not prove full equivalence.

A separate three-run probe with native `model_verbosity = "medium"` used the decisive customer facts in only one run. Fable-ous therefore does not take ownership of verbosity and does not claim to solve optional evidence discovery. That behavior belongs to the working model and native harness; adding hooks or a controller to force it would violate the communication-only product boundary.

No native Fable-model run is required because the product changes Sol's communication layer, not its model route.

## Honest limits

The plugin cannot hide native Codex tool receipts, force identical prose on every probabilistic model turn, overrule another plugin's higher-priority hook, or guarantee compatibility with future clients without versioned tests.

Do not claim lower total token use or unchanged code quality from style preference alone. Code correctness, required tests, safety, authorization, and honest completion remain hard gates that style cannot compensate for.
