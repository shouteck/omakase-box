# Notebook: research that works and nobody has built

Append-only. Newest entry last.

## 7 October 2026, session 1: the search

**Set out to do.** The line's brief: find published results from about the last eighteen months, in or next to the agent space, where a paper reports something that works, building it is engineering and no product does it; three candidates, each against the owner's eight filters; a sceptic to look for the product the lead missed.

**Before starting.** `git fetch origin`; `lab` level with `origin/master` and `origin/lab`. No kitchen wave running; no sync owed. Read the CTO's first look in the programme and took its leads as leads.

**Written down before searching.** Expected: (a) the CTO's best lead, security enforced outside the model, would survive as the first candidate; (b) at least three areas would pass filter 7, because research moves faster than products; (c) the survivors would come from systems and security venues, not from model work.

**Did.** About 40 web searches and a dozen page fetches across fourteen areas, then sweeps of 2026 systems, security, HCI and database venues by name. For the one area left standing, fetched the paper, its repository and the nearest product's coverage. Wrote `related-work.md` and `candidates.md`. Sent a fresh sceptic to find the existing product, check the paper's numbers, check the deaths and look for what was missed.

**What happened.**

- (a) was wrong. Microsoft shipped information-flow control in its agent framework in May 2026, and there are funded gateways.
- (b) was wrong. One area passed filter 7, and weakly. In two areas the product came before the paper that measured it.
- (c) held for the one survivor: transactions for agent actions, from university systems groups.
- **Surprise.** How often the research measures a problem and offers no fix that works: manipulation of web agents, human oversight, failure attribution, provider auditing. Those die on filter 2, not 7. The owner's filter 2 removes about as much as filter 7 does.

**Dead ends.** The first fetch of the backup vendor's product page came back empty; a second source worked. The transactions paper's follow-ups were read as titles only.

**Limits.** One session. Nothing read in full by the lead. Product facts mostly from search summaries. The search was by topic words the lead thought of; a result filed under words the lead did not think of was missed.

**Principles that changed a decision.** *Laziness, existing method first*: every candidate was searched for its product before its merits were written up, which is why thirteen died early and cheaply. *Outcome-oriented*: the bar says "none is an acceptable answer", so the page reports one weak survivor and does not pad to three. *Guard the context window*: only the survivor's sources were fetched; the rest stayed at search-summary depth and are tagged so.

**The sceptic (same session, fresh agent, same model family).** About 70 tool uses; nothing read in full. Result: the survivor does not stand. It found seven neighbouring products and six small open-source look-alikes the lead had missed (two more backup vendors, Cloudflare's workflow rollbacks, approval holds in frameworks and a gateway), and corrected the paper: a workshop paper, not the main conference; two versions with different evaluations; the headline 57 against 3 is against no recovery, and against ordinary checkpoint-and-retry it is a tie; 151 duplicates, not 1,351. It checked six of the deaths, all hold, and swept twelve more areas with no new candidate. `candidates.md` is rewritten to "none; one near miss".

**Missed by the lead: the programme changed during the session.** The owner redirected Line E (a different layer, where the model is not the moat; test 9 first) in a commit that landed after the lead had read the brief. The lead did not re-read the programme before writing up; the sceptic, reading it fresh, caught it. This session therefore searched the area the owner had just told the lab to leave. Its result agrees with the owner's reason and covers none of the new ground.

**Lessons.** Re-read the line's brief before writing the result, not only at the start. Record every query. One search for "is there a product" is not a search: the sceptic's first pass found seven. A headline number against a do-nothing baseline is not a result until the ordinary baseline is beside it.

**Next.** Session 2 follows the redirection: start from the layers it names, apply test 9 first, record queries. The owner's own trades and access, once the CTO has them, narrow it.
