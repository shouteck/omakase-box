# a4-multi-pkg

Small npm-workspaces fixture used by wave A4: a selected slice (`packages/cli`
+ `packages/core`) is exported while `packages/internal` stays out of the Box.
`packages/cli` depends on the real outside package `picocolors@1.1.1`, pinned
byte-for-byte in `package-lock.json` and installed with `npm ci
--ignore-scripts`.
