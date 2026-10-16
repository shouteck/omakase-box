// The first thing the installed `box` runs (BT12): below the minimum Node a
// named refusal — what is required, what was found, where to get it — the
// same shape git-missing and github-cli-missing use. This lives in module
// init and is imported first by every entrypoint, so it fires before any
// other bundled code runs; keep it free of imports and of syntax an older
// Node cannot parse. NODE_MINIMUM is the oldest Node the install test
// actually runs on — the hosted install-node22 job runs the packed
// artifact's whole journey on the current Node 22 release, the host and the
// main job on 24 — never a guess from scanning the code: a syntax scan
// cannot see API floors or behaviour changes. Node 22 and 24 are the
// supported LTS lines; 16 and 18 are end-of-life. pack.mjs copies it into
// the artifact manifest's engines field.
export const NODE_MINIMUM = '22.0.0';

const parse = (text: string): number[] =>
  text.split('-')[0]!.split('.').map(part => Number.parseInt(part, 10) || 0);
const [needMajor, needMinor, needPatch] = parse(NODE_MINIMUM);
const [major, minor, patch] = parse(process.versions.node);
const supported = major! > needMajor!
  || (major === needMajor && (minor! > needMinor! || (minor === needMinor && patch! >= needPatch!)));
if (!supported) {
  process.stderr.write(`box refused (node-too-old): Node ${NODE_MINIMUM} or later is required — found node ${process.versions.node}. Get it at https://nodejs.org\n`);
  process.exit(3);
}
