# Publishing to npm

The owner's own action. The kitchen prepares this and does not publish, claim or reserve a name.

## Choose the name

Checked with `npm view <name>` on 2 November 2026. "Free" means npm answered that it has no such package, today; anyone can take it first, and npm can refuse a name too close to another.

| Name | State |
|---|---|
| `box-bounty` | Free. The name the package already carries. |
| `omakase-box` | Free. Matches the name the owner uses outwardly. |
| `openbounty` | Free. Matches the board's title. |

The command stays `box` whichever name is chosen.

## Publish

Sign in to npm once with your own account (`npm login`). Then, from a clone of this repository at the release's tag, with dependencies installed:

```bash
node packages/box-cli/pack.mjs
```

```bash
npm publish packages/box-cli/dist-package/box-bounty-0.1.0.tgz --access public
```

Any name other than `box-bounty` means changing `MANIFEST.name` in `packages/box-cli/pack.mjs` and `INSTALL_PACKAGE` in `packages/box-bounty/wording.ts` first; say which, and the CTO does it.

## After it

1. Tell the CTO it is published. The CTO checks `npm view <name>` names your account and the version, and installs it from nothing in a scratch folder.
2. Only then does the prepared branch `wave/PF16-npm` merge: the site's line and the guide become `npm install -g <name>`, and the install line returns to the instruction block.
3. The site needs its own deploy word.

The GitHub release keeps working. npm costs $0 for a public package. A published version cannot be replaced, only followed by a new one, and npm limits taking one down.
