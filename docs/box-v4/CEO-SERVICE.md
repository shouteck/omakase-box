# CEO briefing and finished-report contract

The CEO confirmed on 4 October 2026: the kitchen interface should be simple and intuitive. Show outcomes, recommend the next action, and accept a natural-language "Approve". The CTO handles coordination and evidence; the CEO does not need to compose operational prompts or inspect technical records to run the kitchen.

## One short decision card

For START.md and wave closure, target 100-150 words and normally stay below 200 words. Use plain language, at most three outcome bullets, and one clear decision. Longer explanations are available on request. A material limitation or permission boundary must stay visible even when brevity requires exceeding the target.

Opening briefing:

> **Wxxx - proposed**
> **You will get:** up to three observable outcomes.
> **We will check:** one sentence explaining how success will be demonstrated.
> **Scope:** the material boundary, including any Git action, spending, model/config change or external operation proposed for approval.
> **Decision:** the essential product choice or blocker, only when needed; give a recommendation and its practical consequence.
> **Recommendation:** approve Wxxx. Reply **Approve** or describe a change.

Finished report:

> **Wxxx - completed / partial / blocked**
> **Delivered:** up to three actual outcomes, distinguishing documents, implemented behavior and demonstrated runtime behavior.
> **Checks:** passed / incomplete / failed, plus any material limitation.
> **Saved:** committed and pushed to GitHub, or the actual checkpoint blocker.
> **Next: Wyyy - proposed.** State its outcomes, how they will be checked, and material scope/permission boundaries as above.
> **Recommendation:** approve Wyyy. Reply **Approve** or describe a change.

Do not call incomplete or blocked work complete. If no dependency-ready wave can be responsibly proposed, state the blocker and ask for the smallest necessary decision instead. At the end of the active backlog, report completion and any separately proposed follow-up; do not invent another wave.

## Prepare the next service automatically

At wave closure, reconcile outputs and prepare the next full briefing without waiting for the CEO to request it. Read-only investigation and governance preparation remain permitted; implementation and external actions do not follow from preparation. Present the short decision card backed by the complete, frozen briefing. The CEO should not have to say "show me the briefing", "read Q1-Q8", or specify which leads to consult.

Resolve routine engineering choices within existing authority. Bring only product, scope, budget, integration or material risk decisions that need human judgment. Translate them into outcomes and tradeoffs, recommend a choice, and defer questions that do not block this wave. Never make the CEO read a numbered technical question list to discover which questions matter.

Where a recommended product choice can be included in the wave proposal, state the choice and its consequence explicitly in the card and the full brief; "Approve" then adopts that presented proposal. If an unresolved choice prevents a complete brief, ask that concise question first, revise/freeze the brief after the answer, and then request wave approval. Do not silently treat an answer to a product question as approval to implement.

## Short interface, complete authority

Keep the complete task/dependency matrix, paths, base revision, candidate/brief digests, dispatch identities, model/resource policy, leases, verification, stop conditions, receipts and review evidence in the linked full briefing and records. Offer a single "Details" link; do not print hashes, agent IDs, file inventories or dispatch chains by default. Brevity must never omit a material gap or hide an action being authorized.

"Approve" authorizes only the one clearly named proposal currently presented, with its exact frozen scope. At closure it can approve the presented next wave; it does not re-approve history or retroactively authorize completed work. Record the real human message and bind it to the full briefing. If multiple proposals are pending, ask a short clarification instead of guessing.

The CEO subsequently made routine saving a standing kitchen responsibility: follow GIT-CHECKPOINTS.md to commit and non-force push current reviewed work to the existing private origin/master before the finished report. Do not request separate approval for this routine checkpoint or wait for next-wave approval to save the completed wave. Include one short "Saved" status; keep exact commits/destination/evidence in the records. Different destinations, PRs, deployments or other excluded operations require a concrete separate proposal. Keep unrelated approvals separate and label each short reply clearly.

After approval, run only the approved wave. At the next boundary, return with another short finished report and proposal. START.md, silence, quota reset and a completed report never approve future work.

## Runtime delivery

This contract applies to native Cursor pstack, the Devin portable adapter and the Codex fallback. Use repository instructions and actual available tools. Editing these files does not inject a message into an already-running agent's context; on its next instruction refresh, the CTO applies this contract and reconciles any still-proposed briefing. Preserve immutable approved briefs and accepted evidence. Do not rewrite historical approvals to match the new presentation format.
