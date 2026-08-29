# Fable-ous verification

Candidate 0.2.4 is a native-plugin-only release. The separate Focus/Strict Codex SDK client, prompt runner, model launchers, clean-route wrapper, and `@openai/codex-sdk` dependency have been removed.

## Product boundary

Fable-ous shapes communication through the normal Codex instruction stack and supported native settings. It does not own the terminal stream, start a second client, route work, auto-continue, classify command truth, change coding instructions, or replace host safety and approval controls.

The installer applies three reversible native preferences:

- `personality = "friendly"`
- `model_verbosity = "low"`
- `hide_agent_reasoning = true`

These settings and the voice contract affect presentation. Model choice, reasoning effort, tools, plugins, hooks, sandbox, approvals, coding, testing, verification, and completion judgment remain native Codex responsibilities.

## Deterministic gates

The release gate requires:

- complete Node syntax and test suite;
- Bun native-plugin boundary proof;
- Codex and Claude plugin validators;
- zero dependency vulnerabilities;
- clean `git diff --check`;
- allowlisted npm package contents;
- a cachebusted installed plugin whose runtime bytes match the source candidate;
- fresh-session doctor evidence.

The tests cover reversible instruction installation, native preference installation and restoration, user changes made after installation, the absence of lifecycle hooks, forced Claude output style with coding instructions preserved, CLI installation/update behavior, package boundaries, and the absence of a replacement Codex runtime.

## Existing model evidence

Earlier Sol runs showed that the communication contract can produce short outcome-first answers and that a synthetic coding fixture can move from 1/4 to 4/4 while preserving the test-file SHA-256. Those runs are encouraging code-quality evidence, but some used the removed Focus presentation path and therefore do not prove the 0.2.4 native-plugin experience.

Fresh native Codex 0.150.1 / GPT-5.6 Sol xhigh evidence for 0.2.4:

- a no-tool product judgment returned one direct recommendation and one concrete next step in two short paragraphs;
- the finite-average fixture moved from 1/4 to 4/4 tests with a minimal implementation change;
- the test file remained byte-identical with SHA-256 `2bf12d36220ca5628fc004f6786149f1d80a500151312132f6cda6d588d956c2`;
- host rerun confirmed 4/4 after the model turn.

The same coding probe exposed an external-harness confound: Maestro's Stop hook replaced Sol's concise successful final with `NOT VERIFIED` because the isolated fixture was not a tracked Git repository. This did not change the code or test result, but it proved that a separate blocking Stop hook could override Fable-ous presentation. The Maestro 0.47.70 candidate removes that generic completion hook from both clients while retaining action-boundary safety.

The matched native A/B defined in [CLEAN-ROUTE-EVAL.md](CLEAN-ROUTE-EVAL.md) was then run on Codex 0.150.1 with GPT-5.6 Sol xhigh in isolated fresh homes. Both baseline and Fable-ous passed all 12/12 hard gates across four code tasks, two diagnoses, two product judgments, two proof judgments, and two irreversible-action boundaries. There were no harness failures. Fable-ous finals used 743 words versus 893 for baseline, a 16.8% reduction, while every deterministic code and safety oracle remained equal. This proves no regression on the matched set; blind preference scoring remains a separate experiential measure.

No native Fable-model run is required because the product changes Sol's communication layer, not its model route.

## Honest limits

The plugin cannot hide native Codex tool receipts, force identical prose on every probabilistic model turn, overrule another plugin's higher-priority hook, or guarantee compatibility with future clients without versioned tests.

Do not claim lower total token use or unchanged code quality from style preference alone. Code correctness, required tests, safety, authorization, and honest completion remain hard gates that style cannot compensate for.
