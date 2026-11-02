# Publishing to npm

The owner's own action. The kitchen prepares this and does not publish, claim or reserve a name.

## The name

**`omakase-box`** (owner, 2 November 2026). `npm view omakase-box` found no such package that day. That reserves nothing: anyone can take it first, and npm can refuse a name too close to another. The command stays `box`.

## Publish

Sign in to npm once with your own account (`npm login`). Then, from a clone of this repository on the branch `wave/PF16-npm`, which carries the name, with dependencies installed:

```bash
node packages/box-cli/pack.mjs
```

```bash
npm publish packages/box-cli/dist-package/omakase-box-0.1.1.tgz --access public
```

## After it

1. Tell the CTO it is published. The CTO checks `npm view <name>` names your account and the version, and installs it from nothing in a scratch folder.
2. Only then does the prepared branch `wave/PF16-npm` merge: the site's line and the guide become `npm install -g <name>`, and the install line returns to the instruction block.
3. The site needs its own deploy word.

The GitHub release keeps working. npm costs $0 for a public package. A published version cannot be replaced, only followed by a new one, and npm limits taking one down.
