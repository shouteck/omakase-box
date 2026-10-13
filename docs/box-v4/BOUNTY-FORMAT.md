# Box bounty format, versions 1–2

A bounty is a GitHub issue asking for a code change, with a branch for answers.
Find open bounties across repositories with GitHub issue search:
`is:issue is:open label:box-bounty`. Add `repo:OWNER/REPO` for one repository.
The public search API is `GET https://api.github.com/search/issues?q=is%3Aissue%20is%3Aopen%20label%3Abox-bounty`.
Read each result's issue body, never its comments.

The body ends with exactly one HTML comment in this form. Parse its contents as JSON.
Reject duplicate `<!-- box-bounty-format` markers, a missing final `-->`, or a block outside the end of the body.
Both versions have exactly the fields below. Unknown fields or another version need a different parser.
Older issues can have no block. An issue's author can edit its body, so this is a published statement, not proof of a merge or payment.

```text
<!-- box-bounty-format
{"schemaVersion":2,"kind":"box-bounty","id":"bt-0123456789ab","repository":"owner/project","workCommit":"0123456789abcdef0123456789abcdef01234567","branch":"box-bounty/bt-0123456789ab","withChanges":false,"createdAt":"2026-10-13T11:20:00.000Z","state":{"kind":"open"},"reward":{"amount":25,"currency":"USD"},"terms":"merged-solution-earns-whole"}
-->
```

**What changed in version 2 (BT11a, 13 October 2026):** `reward.amount` is no
longer fixed at 0 — it carries the whole-dollar amount the owner had set when
the bounty was posted. Everything else is unchanged. A version 1 block still
reads: its `reward.amount` is always `0`. There is no other difference between
the versions, so a reader written for version 1 that accepts either version
number reads both.

| Field | Meaning |
|---|---|
| `schemaVersion`, `kind` | Version `1` or `2`, format name `box-bounty`. |
| `id` | `bt-` followed by exactly 12 lowercase hexadecimal digits. |
| `repository` | GitHub `OWNER/REPO`, with letters, digits, `_`, `.`, and `-` in each part. |
| `workCommit` | Exactly 40 lowercase hexadecimal digits identifying the published bounty branch tip to work from. |
| `branch` | Exactly `box-bounty/` followed by `id`. |
| `withChanges` | `true` when the branch carries the poster's work above its previous public base. |
| `createdAt` | Creation time as an ISO 8601 UTC string. |
| `state` | Exactly `{"kind":"open"}`, `{"kind":"closed-none"}`, or `{"kind":"closed-merged","pullRequest":7,"commit":"FULL_MERGE_SHA"}`. PR is a positive safe integer. Commit has 40 lowercase hexadecimal digits. |
| `reward` | `{"amount":<whole dollars at or above 0>,"currency":"USD"}`. Version 1 accepts only `{"amount":0,"currency":"USD"}`; version 2 carries the amount in force at posting. |
| `terms` | `merged-solution-earns-whole`: the merged solution earns all the reward. Other solutions and parts used by hand earn nothing. |

The reward is a stated amount, not a paid one: payment is the poster's to make
by hand, and posting an answer does not guarantee it. The visible issue text
says the same number in words — the block and the listing never disagree.

To answer, fork the repository, branch from the bounty branch, and open a pull request against that branch in the original repository.
The poster's tool lists answers and their changes. The poster chooses. The tool runs nothing a solver wrote.
`workCommit` is the tool's publication plan tip. `withChanges` is true when that plan publishes one or more poster commits, including any task-needed uncommitted work.
The tool publishes the closed state after finding the merge, or closes with none. If someone corrupts the block, closure still proceeds and the tool reports that the block was preserved.
There is no promise that anyone watches, that an answer is used, or that anyone pays.

The [standalone reader](../../tests/box/bounty/bt10-reader.mjs) uses public search without the tool's code.
