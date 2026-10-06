# Labelling guide for the map of requests, version 0 (pilot)

Purpose: for each thing a request asks for, record the cheapest kind of check that could decide whether it was done, without the requester reading the solution's code. Counted over many real requests, this says what share of real work each kind of check would unlock.

Label alone. Do not look at anyone else's labels. If two labels seem to fit, apply the tie-break rule; do not invent a new label. Use the notes column for doubts.

## The unit

One **clause**: one acceptance condition as the requester wrote it. In a wave brief, each bullet under "Done when" is one clause. Use the brief's "Outcome" paragraph only as background.

## The question

> What is the cheapest thing the requester would have to supply so that a machine, or failing that a person, can say yes or no to this clause?

## The labels

Listed from cheapest for the requester to most expensive. Give each clause exactly one.

| Label | Use when | Typical wording |
|---|---|---|
| `EXISTING` | A test, suite or command that was already in the repository before this request decides the clause. The requester only names it. | "suite X still exits 0", "existing tests unchanged and green" |
| `COMMAND` | Nothing existing decides it, but one or a few short shell commands do: run something and look at the exit code, search the output or the files for a string, see whether a file, tag, process or container exists. No fixtures, no fabricated inputs. | "git grep finds no reference to Y", "the tag exists on origin", "a new suite Z exits 0" |
| `EXAMPLE` | The clause gives concrete inputs and the exact expected result, and comparing them needs no further thought. | "request A ships exactly these three files" |
| `MEASURE` | A quantity is measured and compared with a threshold or with a before/after value. | "within 10% of the known figure", "at least five runs each, with spread" |
| `NEW-TEST` | Deciding it needs purpose-built test code: set-up, fixtures, fabricated or hostile inputs, a negative case that must be constructed. | "a non-owner cannot approve, and this is tested", "a fabricated violation trips the limit" |
| `READ` | No mechanical verdict is possible as written. A person has to read a report, a record, a document or the code and judge. | "the wave file records what the recipient needed", "no assertion is weakened", "a recommendation names the approach" |

## Rules

1. **Compound clauses.** If a clause has several parts needing different labels, give the label of its most expensive part, in the table's order. Put "compound" in the notes.
2. **"Suite or command X exits 0."** `EXISTING` if X existed before the request; `COMMAND` if the request itself creates X. If the brief does not say, assume it existed.
3. **"…and this is tested" or "prove it".** The clause asks for a constructed case, so `NEW-TEST`, unless a single plain command on the real repository would show it (`COMMAND`).
4. **"Record", "state", "report", "the file says".** `READ`, even if the thing recorded is a number.
5. **Do not label how you would prefer to check it.** Label the cheapest check that decides the clause as written.

## The second column: observable

`y` if whether the clause holds can be seen from outside the code: at a command line, over HTTP, in the file system, in Git or in a browser. `n` if it can only be seen by reading code, tests or prose.

## The file to produce

A CSV with a header line and one line per clause id, in the order of `pilot/ids.txt`:

```
id,label,observable,notes
D1.2.1,COMMAND,y,compound
```

Notes must not contain commas.
