---
description: Apply the PG product lens to decide whether, what, or how little to build
disable-model-invocation: true
---

# PG mode

Use this as a product decision lens synthesized from Paul Graham's published essays. Do not impersonate Paul Graham, write in his persona, or imply that this is what he would say. Prefer plain synthesis over quotation; never reproduce long passages.

PG mode is explicit-only. Apply it to the current question only when the user invokes PG mode, then return to the ordinary host workflow. Do not silently activate it or keep it active in later turns. Do not call a model or external service to apply this lens.

This lens can recommend deleting, deferring, narrowing, or manually testing an idea, but it is advice and never a blocker. It does not own, replace, or override coding, tests, review, safety, authorization, or completion. It cannot expand the user's explicit authorization or veto work the user has chosen to do.

## Apply the lens

Start with the strongest recommendation and the evidence behind it. Use the available context instead of asking ritual questions. Make uncertainty visible when the evidence is genuinely missing.

Test the decision in this order:

1. **Named user and pain.** Identify a real person or sharply defined early user, the painful job they are trying to do, and why the current alternative is inadequate. An abstract market is not demand.
2. **Behavior over praise.** Prefer payment and completed use over praise, stated willingness, meetings, or feature requests. Separate observed behavior from interpretation.
3. **Smallest learning step.** Ask whether the code can be avoided. When demand is uncertain, prefer a manual experiment that does not scale and puts the real value or buying decision in front of the user.
4. **Narrow and reliable.** If code is justified, choose the smallest reliable end-to-end result. A minimal first version is acceptable; a broad or unreliable one is not.
5. **Organic pull.** Look for repeated use, retention, an introduction or referral that actually happens, and users who would be disappointed to lose the product. Do not rename enthusiasm as love.
6. **Founder-owned learning.** Keep the founder close to onboarding, support, sales, rejection, and the surprising details. Agents can prepare and execute bounded work, but should not hide the learning loop.
7. **Earn scale.** Automate, generalize, hire, fundraise, or build infrastructure only after the narrow proof reveals a repeatable bottleneck. Use revenue or the nearest honest behavior metric, not activity volume, as the compass.

## Choose the next move

- **Delete or defer** when there is no named user, no painful job, or the work mainly creates infrastructure for hypothetical demand.
- **Run a manual proof** when the user and pain are plausible but payment, use, or repeat behavior is unknown.
- **Build the narrow version** when it is the shortest path to a real user's valuable behavior and the result can be made reliable.
- **Scale** only when repeated behavior shows pull and the next bottleneck is genuinely capacity or distribution.

Keep the response natural rather than forcing a scorecard. Make four things easy to see: the recommendation, the customer evidence, the smallest proof worth running, and what not to build yet. State the observation that would falsify the recommendation. Cite essay titles only when attribution materially helps; do not manufacture quotes or faux aphorisms.

Useful essay anchors include *What I've Learned from Users*, *Do Things that Don't Scale*, *How to Get Startup Ideas*, *The Hardest Lessons for Startups to Learn*, *Startup = Growth*, *Ramen Profitable*, *The 18 Mistakes That Kill Startups*, *The Top Idea in Your Mind*, *Founder Mode*, and *Taste for Makers*.

If the user asks for implementation in the same request, apply the lens first and then return control to the host's normal implementation workflow. PG mode does not change how code is written, tested, reviewed, approved, or shipped.
