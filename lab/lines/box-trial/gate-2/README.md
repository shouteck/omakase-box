# Gate 2 instrument

The [plan](../gate-2-plan.md) is the authority; it was pushed (`4f98f3f`) before any record for the thirty tasks was downloaded. No project code and no agent is run here.

```
python lab/lines/box-trial/gate-2/check.py     # known answers for the command classifier
python lab/lines/box-trial/gate-2/fetch.py     # public run records, free; keeps what is already saved
python lab/lines/box-trial/gate-2/measure.py   # writes summary.json; with task ids, sample-rerun.json
python lab/lines/box-trial/gate-2/report.py    # prints the tables
```

`fetch.py` downloads each agent's record per task and its resolved flag from the submission's own evaluation files, and writes `receipts.json` (URL, size, SHA-256, resolved). Records are large and stay under `records/`, ignored by Git.

`measure.py` turns a record into steps (a shell command, its output, the call's input tokens), splits a command on `&&`, `;` and newlines unless it holds a here-document, and classifies each part: edit, view, search, run, other. Edit is tested before view so that `cat > file` and `sed -i` are not taken as reading; that order differs from the list in the plan and changes no definition. Files and functions are mapped on Gate 1's base snapshot; the Box and the rival file filter come from Gate 1b's recorded trace; the target is Gate 1b's. The rows named `strict` count reaching only by viewing or editing, never by a search hit; they were added after the first numbers were seen.

Known blind spots: reading inside Python snippets; output the agent's harness truncated; paths given relative to a directory other than the repository root; files that are not `.py`.
