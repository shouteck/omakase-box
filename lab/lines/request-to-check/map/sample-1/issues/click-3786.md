# click-3786

Repository: pallets/click · Issue #3786 · Group: fixed · Created: 2026-08-22T04:20:57Z · Closed: 2026-08-25T01:48:50Z
Labels: none · Reporter's role: MEMBER

## Title

release 8.5.0

## Body

[Pallets release steps](https://palletsprojects.com/contributing/release)

- [x] Decide to make a release.
- [x] Ensure the change log has entries for each user-facing non-docs change, with links to the related issue reports.
- [x] Ensure each issue and PR is in the milestone. 
- [x] verify or trigger [nightly tests](https://github.com/pallets/click/actions/workflows/nightly.yaml)
- [x] Create a release-A.B.C branch.
- [x] Change "Unreleased" to "Released YYYY-MM-DD" in CHANGES.md.
- [x] Remove the ".dev" suffix from the version in pyproject.toml.
- [x] Commit git commit -am 'release version A.B.C' and create a PR.
- [x] Tag `git tag -am 'release version A.B.C' A.B.C` and push `git push upstream A.B.C.`
- [x] Watch the tests pass and build jobs begin.
- [x] Edit the generated draft release page with our standard message template.
- [x] Approve the upload job.
- [x] Merge the PR. Use "create a merge commit", not "squash" or "rebase"!
- [x] Close the milestone.
- [x] Publish the draft release page.
- [x] Merge main into stable (or stable into main): 
- [x] Start the next version(s), creating a change log section, bumping the version in pyproject.toml with the .dev suffix.
- [x] Done!


## Comments (3)

### Comment 1 · COLLABORATOR · 2026-08-26T08:50:44Z · AFTER the fix was opened

Is it normal that it's still not published on PyPI and GitHub release? I guess you are still working on the 8.5.0 release right? :)

### Comment 2 · MEMBER · 2026-08-26T13:38:30Z · AFTER the fix was opened

I clicked approve on the workflow now.

### Comment 3 · MEMBER · 2026-08-27T03:46:59Z · AFTER the fix was opened

That was my bad, I saw the pr approved and thought everything had been approved and merged it. 

## The fix

Pull request #3787, opened 2026-08-22T04:32:35Z, merged 2026-08-25T01:48:49Z. Title: Release version 8.5.0

Files changed (3):
- modified: CHANGES.md
- modified: pyproject.toml
- modified: uv.lock

## Test changes in the fix (0 files)

None: the fix changed no file whose path looks like a test.
