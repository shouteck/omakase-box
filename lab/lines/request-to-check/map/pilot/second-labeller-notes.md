# Second labeller notes (pilot, guide version 0)

Who: a fresh subagent started by Claude Code on the owner's Windows host. The harness told me the model is Opus 5.5 (claude-opus-5-5). I cannot confirm that from the inside. I do not know which model or host produced the first set of labels, so I make no claim about independence beyond this: I did not open any other labels.

What I read: GUIDE.md and pilot/clauses.md. I did not open ids.txt; a script compared my id column with it and printed only "match". For rule 2 I ran one search over `waves/D1.2.md`, `waves/D2.1.md`, `waves/K2b.md` and `waves/K3.md` for four suite names. That search also showed me a few Result lines from those wave files (verify summaries). They did not change any label except the two rule 2 ones below.

Result: 79 lines. READ 29, COMMAND 23, NEW-TEST 21, EXISTING 5, MEASURE 1, EXAMPLE 0.

## The headline

Rule 1 plus rule 4 turn the map into a count of how wordy the brief is, not of what check the work needs. Twelve or so of my 29 READ labels are READ only because the clause ends with "record it", "state in the report", "pick and document" or "the wave file records the minutes". The real condition in those clauses is a suite, a command or a constructed test. If the lab counts my labels as they stand, it will conclude that over a third of real work needs a person to read, which is false. I put "core is X" in the notes for each such clause so the count can be redone.

## Decisions I had to invent because the guide is silent

1. **What counts as a "part" under rule 1.** I treated a separately stated obligation (its own sentence, or a rider with a verb such as record, state, report, document) as a part. I treated a qualifier inside a sentence ("a real run", "for real", "computed from X only", "mapping lives somewhere readable") as incidental and only noted it. This line is my own and another labeller will draw it elsewhere.
2. **Observable for compound clauses.** I marked `y` only if every part can be seen from outside. So a clause whose core is a plain command but which also says "state in the report how" gets `n`. Where that happens the note says the core is observable.
3. **Is a JSON file "prose"?** I said no. D2.1.5 is READ by rule 4 but observable `y`.
4. **Is grep over test files "reading tests"?** I said no, it is the file system. K2a.3 is `y`.

## Hardest clauses

- **D2.1.2.** The guide's own EXAMPLE row quotes this clause. But the clause ends "your choice, record it", so rules 1 and 4 force READ. I followed the rules and labelled READ. I think EXAMPLE is the honest label. Also "scaffold + evaluator" is not an exact list, so even the EXAMPLE part is not fully exact.
- **K5.5.** Same fault, worse. The guide's MEASURE row quotes "at least five runs each, with spread", which is this clause. The clause says "recorded in the wave Result" and "report either way", and rule 4 says READ "even if the thing recorded is a number". I labelled READ. The guide contradicts itself on its own example. Also there is no threshold in the clause, so "keep only if the numbers support it" is a judgement in any case.
- **D2.1.5.** "`box.json` records: ..." The word "records" triggers rule 4, so READ. But this is a machine-readable file and a ten-line field check decides it. READ is misleading here.
- **K9.5, K5.6, K8.3.** A negative case built once by hand ("prove this once by stashing a leftover reference", "scripted demo, then revert", "deliberately-broken scratch-branch push"). Not test code, so NEW-TEST's definition does not fit. Not a plain command on the real repository, so COMMAND does not fit. Afterwards nothing remains to run, so what the requester actually checks is a report, which is READ. I gave K9.5 and K5.6 NEW-TEST by rule 3, and K8.3 COMMAND because the red run stays visible through `gh`. I am not confident in any of the three.
- **K1.3.** "Has no database cap." An absence claim about code. No test proves it. I gave READ. The "drops the databases it created" part cannot be checked afterwards because the server is destroyed, which is true of K2a.4 as well.
- **K4.7.** "Bit-for-bit unchanged: prove by running before/after and comparing summary lines." Rule 3 says NEW-TEST unless one plain command shows it. The clause prescribes two runs and a diff, so COMMAND. But it is a before/after comparison, which is MEASURE's wording, and the prescribed proof covers only PASS, not FAIL or UNCOMMITTED. Three labels are defensible.
- **K5.2, K5.7.** Each can be shown by hand with three commands on a throwaway branch (COMMAND) or by a test with fabricated history (NEW-TEST). The words "never" and "every" pushed me to NEW-TEST. Rule 5 arguably pushes to COMMAND.
- **D2.2.2, D3.1.2.** "A real recipient run produced..." and "end-to-end on the real artifact". Running the validator is a command. Whether the artifact came from a real blind run is not decidable by any check. I gave COMMAND and noted it.
- **K6.4, K6.6, R1.2, R1.3, R1.5 (second half).** These are instructions about who does what and how ("reviewer owns final verification", "preparation worker must NOT implement this edit", "independent pass remeasures"). They are not properties of the delivered change. READ is the only label available, but it hides that no reading of the result can decide them either; you have to trust a process record.
- **K1.5.** "Is still rejected" suggests an existing test already covers it, which would be EXISTING. The clause does not say. I gave COMMAND.
- **K9.4.** The command is given, but "only deletions plus the edits the inventory named" means comparing two lists. Mechanical if someone writes a script, a judgement if not.

## Faults in the guide

1. **Rule 1 and rule 4 together swamp everything.** Described above. A reporting rider is not a part of the work.
2. **The table's examples break the rules.** The EXAMPLE row and the MEASURE row each quote a clause that the rules label READ. The COMMAND row's "a new suite Z exits 0" is fine; the two others are not.
3. **"The tie-break rule" is never named.** The opening says "apply the tie-break rule". There are five rules and none is called that. I assumed rule 1. But rule 1 is about several parts needing different labels, not about one part where two labels fit (K4.7, K5.7). For that case there is no rule. Rule 5 ("cheapest check") points the opposite way from rule 1 ("most expensive part"), so a labeller can justify either direction.
4. **The unit is wrong for this data.** "Each bullet is one clause" but most bullets hold three to six conditions. More than half my lines say "compound". One label per bullet throws away most of the information and makes the labels depend on which sub-part the labeller thinks is most expensive.
5. **No label for a constructed demonstration that is not test code.** See K9.5, K5.6, K8.3, R1.4.
6. **No label for process or provenance conditions.** "Real", "fresh", "independent", "must not implement", "first add". READ implies someone can read and decide. Often they cannot.
7. **COMMAND's "no fixtures, no fabricated inputs" is unclear about set-up.** Does a temp clone count (D3.1.2)? Does setting one environment variable count (K1.5)? Does stopping Docker count (K2a.1, K1.2)?
8. **EXISTING versus COMMAND is a weak distinction in practice.** Almost every "verify exits 0" clause comes with a precondition ("with Docker stopped", "leaves nothing behind", "twice in a row") that makes it compound and so COMMAND. Only 5 clauses survived as EXISTING. Rule 2's default ("assume it existed") was also wrong both times I checked it (D1.2.1, D2.1.1): the wave file's write scope showed the suite script was added by that wave. The clause text alone does not tell you.
9. **Observable is undefined for compounds, for universal claims and for machine-readable records.** "Seen in the file system" and "reading prose" overlap: every wave file is in the file system.
10. **MEASURE requires a threshold but real clauses rarely give one.** K5.5 and K6.2 say measure and report, then leave the decision to judgement. Only K4.3 has a number to compare with. "about 0 s" in K5.2 is a threshold hidden inside a compound.
11. **Clauses that point outside themselves.** D1.2.4 "one stated exception below", K9.3 "the inventory (below)", D3.1.5 "the three labels above". The clause list alone is not enough to label them; I guessed.
12. **Clauses that contain permissions, scope limits or rules for later work rather than conditions.** K1.6 second sentence, K2a.5 parenthesis, K6.5 last sentence, R1.6 last two sentences. The guide does not say to ignore them.

## Suggested changes

1. Split bullets into atomic conditions before labelling (by script on sentence and semicolon boundaries, then one human pass). Label each atom. If the lab still wants one label per bullet, compute it from the atoms afterwards, and publish both.
2. Replace rule 4 with: "A request to record or report something is its own atom, labelled READ. It never changes the label of the condition it reports on." Then delete the conflict with the MEASURE and EXAMPLE rows.
3. Say explicitly which way ties go when one atom fits two labels. I suggest: the cheaper label, if a person with only a shell and the repository could run it in under a few minutes without writing a file; otherwise the dearer one.
4. Add a label, say `DEMO`, for a constructed case shown once and not kept as a test. Or say plainly that it is NEW-TEST when the brief keeps it in the suite and READ when it is reverted.
5. Add a label, say `PROCESS`, for conditions about who did the work or how, which no inspection of the result can decide. Count it separately from READ.
6. Add a rule for qualifiers such as real, fresh, only, for real, same way: either always ignore them, or always split them out as their own atom.
7. Define COMMAND's limit on set-up with examples: environment variable yes, temp clone yes or no, throwaway commit yes or no, stopping a service yes or no.
8. Change rule 2's default, or require the labeller to check the wave's write scope. As it stands the default is wrong for the first wave of every new suite.
9. Split MEASURE into "measured against a stated threshold" and "measured and reported, no threshold". Only the first gives a verdict.
10. Define observable per atom, and say whether a structured file (JSON, CSV) counts as observable and a prose file does not.
11. Give the labeller the lines a clause points to ("below", "above") or strip such clauses from the pilot.
12. Fix the table examples so that every quoted wording gets the row's label under the rules as written.
