# Fix the dangling rendering of an empty `allowedDestinations` list

This repository is a Node.js + pnpm monorepo. It builds a command-line tool,
`box`, whose `bounty` commands hand off a piece of work to an outside solver.
After a build the CLI runs as:

    node packages/box-cli/dist/cli.js bounty <command>

## The bug

`.box/limits.json` at a repository's root is the owner's limits file. One of
its optional fields, `allowedDestinations`, is a list of directories that
`bounty post --to <dir>` must deliver inside. When the field is present but an
EMPTY list — `"allowedDestinations": []`, meaning no destination is allowed —
two pieces of output render wrong:

- `bounty describe` prints the line

      where post --to may deliver: only inside

  with nothing after "only inside" — a dangling sentence. (Note the trailing
  space.)
- the `destination-not-allowed` refusal prints empty parentheses `()` where
  the allowed directories should be named.

An empty list must keep its meaning — every `post --to` is still refused.
Only the rendered text is broken: a reader should be told that no
destination is allowed, not shown a dangling sentence or empty parens.

## Where it lives

Both renderings live under `packages/box-bounty/`: `describe` composes its
facts there, and the `post` refusal sits beside the posting logic. Both join
the destination list into a sentence without handling the empty case.

## Set up and prove

    npm ci --prefix scripts/tooling --ignore-scripts
    node scripts/pnpm.mjs install --frozen-lockfile
    node scripts/workspace.mjs build
    node kitchen/bt5/check.mjs

The first line is required in a fresh copy: this repository has no
`node_modules` until then, and `scripts/pnpm.mjs` only runs after the
repository-local pnpm in `scripts/tooling` is installed. The check builds
scratch Git repositories, runs the built CLI's `describe` and `post` against
them, and exits nonzero today. It needs `node`, `npm` and `git` on PATH.

## Done when

`node kitchen/bt5/check.mjs` exits 0. Keep the semantics:

- an empty list still means no destination is allowed (post still refuses);
- an absent `allowedDestinations` field still means any local folder;
- a non-empty list still names its directories.
