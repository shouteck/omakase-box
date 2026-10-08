# The Box the agent would meet

**Recommendation:** first try silent search ordering, with no extra instruction and no badges by default. Keep the whole repository open. Facts on request are a separate optional choice.

**Real example: Django’s checkbox attributes failing test.** The agent searches for `get_context` in the usual way. The prototype puts methods in functions the failing run called first while retaining every result. In this saved snapshot search, the changed method moves from result 15 to 4:

```text
[ran]django/forms/widgets.py:227  Widget.get_context
[ran]django/forms/widgets.py:292  Input.get_context
[ran]django/forms/widgets.py:293  context = super().get_context(...)
[ran]django/forms/widgets.py:523  CheckboxInput.get_context
```

These labels abbreviate the preserved native source records to illustrate the optional badge. **“ran” means the containing function was called, not that every displayed statement ran.** Without badges, the same ordering returns native text. An illustration, not proof of better repairs.

**Promise:** complete ordinary results; relevant functions first when file, starting line and source are verified. Stale, ambiguous or missing evidence stays unmarked. Recognized source/line formats are supported; others fall back. It does not diagnose the bug or guarantee the first result is the fix. Some historical targets still move later.

**Cost:** order-only adds zero instruction/output bytes. Computation remains: about 0.9–1.0 seconds for the index and 0.4–0.7 seconds for native search plus display on this example (three timings). Badges add 25 bytes to its 12,680-byte answer. Across retained real queries, median measured prefix saving is zero; 53 queries have more badge cost than estimated saving. Actual tokens and saved reading are unmeasured. Keep routine badges out of version one.

**Separately, facts on request:** “What ran in this file?” returns 14 definitions including Widget, Input and CheckboxInput.get_context: 670 bytes. “How did the test reach failure?” shows the three calls and returns in order, then the assertion at test line 96: 598 bytes, eight other recorded events explicitly omitted. The corrected collector took 1.7 seconds versus 1.2 untraced on this one test; an initial 15-second version is retained. No diagnosis/model is involved.

**Owner choices, after review:**

1. **Start with ordering alone?** Yes; keep badges off until their benefit is measured.
2. **Include facts on request?** Keep them experimental and optional; they add context and their repair benefit here is unknown.
3. **Authorize a capped pilot after agreeing this design?** Recommend one fair pair on a harder task, then stop and inspect it. No live repair agent ran this session.

[Checks and limits](result.md). This is a throwaway lab prototype for the kitchen to rebuild after design agreement.
