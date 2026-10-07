# Labelling guide for the map of requests, version 1

Version 0 is kept as `GUIDE-v0.md`; what its pilot found wrong is in `pilot/RESULT.md` and `outside-sample/RESULT.md`. This version is written for requests from outside our own kitchen: issues on public trackers.

Purpose: for each thing a request asks for, record where a check that decides it could come from, and how much of that check the request itself pins down. Counted over many real requests, this says what share of real work each way of getting a check would cover.

Label alone. Do not look at anyone else's labels or at any result file. Label what the text says, not what you know or can guess about the project. If two values seem to fit, take the cheaper one (the one earlier in its table) and say so in the notes.

## The unit: one condition

A request is one issue: its title, body and comments. It has been split beforehand into **conditions**, each a single thing that would have to be true for the requester to be satisfied, quoted or closely paraphrased from the text with its source (body, or comment number). You label the conditions you are given; you do not re-split. If you think a split is wrong, label it anyway and say so in the notes.

## Column 1: `about`

| Value | Use when |
|---|---|
| `RESULT` | The condition is about what the software does or contains after the change. |
| `RECORD` | It asks for something to be written down: documentation, a changelog entry, a comment, a report. |
| `PROCESS` | It is about how or by whom the work is done, not about the result. |
| `NONE` | It is not a request for a change: a question, a discussion, a duplicate, a request for support. |

Only `RESULT` conditions get columns 2 to 4. For the others write `-` in those columns.

## Column 2: `source`, the cheapest place a deciding check could come from

Listed from cheapest for the requester to dearest.

| Value | Use when | What the requester would have to supply |
|---|---|---|
| `REPO` | The text itself points to a test, suite or command already in the repository that decides the condition. | Its name. |
| `REQUEST` | The text contains both a concrete input (code, a command line, a file, a call) and the result that is wanted, closely enough that turning them into a command needs no design decision. A reproduction with only the *wrong* result counts only if the right result is stated or is unmistakable (for example "should not throw"). | A copy of what they already wrote. |
| `NEW` | Deciding it needs a check somebody has to design: choosing inputs, building fixtures, deciding what exactly to assert. The behaviour wanted is clear enough that a competent stranger could design it. | A test, or review of one. |
| `PERSON` | No mechanical check is possible as written, or what is wanted is not settled in the text: someone has to decide or judge. | Their own judgement, after the fact. |

Set-up rule: if the reproduction needs tools or versions the text does not name, or more than a few lines of surrounding set-up that the text does not give, it is `NEW`, not `REQUEST`.

## Column 3: `role`

| Value | Use when |
|---|---|
| `OUTCOME` | The condition is false today and should become true: it is what was asked for. |
| `GUARD` | The condition is true today and must stay true ("without breaking X", "keep Y working"). |

## Column 4: `observable`

`y` if whether the condition holds can be seen from outside the code: at a command line, through the public interface, over HTTP, in a file or in a browser. `n` if it can only be seen by reading the source.

## Column 5: `determined` (only for requests that come with a fix)

Some requests in a sample are already fixed, and the file you are given includes the test changes from the fix. For these there is one more line per request, not per condition, with the id `<request>.T`:

> Reading only the request text written **before** the fix (the file marks which comments those are), is what the fix's tests assert already determined?

| Value | Use when |
|---|---|
| `YES` | The inputs the tests use, or equivalent ones, and the results they expect are stated in the text. Someone holding only the text would have written essentially these assertions. |
| `PARTLY` | The text names the behaviour, but the tests assert specifics the text does not give: exact messages, edge cases, a chosen interface, a broader or narrower rule. |
| `NO` | The tests assert something the text does not ask for, or something that differs from what the text asks for or suggests. |
| `NO-TEST` | The fix changed no test files. |

In the notes for a `PARTLY` or `NO`, name the one specific thing the tests assert that the text does not determine.

## The file to produce

A CSV with a header line and one line per id, in the order of the ids file you are given:

```
id,about,source,role,observable,determined,notes
click-3010.1,RESULT,REQUEST,OUTCOME,y,-,
click-3010.T,-,-,-,-,PARTLY,tests assert an exact error message the issue does not give
```

Notes must not contain commas. Use `-` for a column that does not apply.
