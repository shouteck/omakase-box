# Agent docs: Monid and payments

Copy-only follow-up to PF53 and PF52. Keep the docs unpublished until the payment changes are deployed.

## Changed expectations

- `pf6.test.ts::the skill is a trusted front door to local execution and read-only discovery` — Shorten the CLI help and posting guidance to leave room for Monid under the existing 1,200-character limit; replace the old import-only approval sentence with guidance for GitHub approval and payment comments. Keep the CLI help, public repository and standing approval checks.
- `llms.test.ts::is plain text in the llms.txt shape: a title, a summary, then sections of links` — Rename the CLI-only heading to cover both CLI and Monid workflows. Keep the exact section structure check.
