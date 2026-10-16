// The first thing the installed `box` runs (BT12): below the minimum Node a
// named refusal — what is required, what was found, where to get it — the
// same shape git-missing and github-cli-missing use. This lives in module
// init and is imported first by every entrypoint, so it fires before any
// other bundled code runs; keep it free of imports and of syntax an older
// Node cannot parse. NODE_MINIMUM is derived from what the tool's code
// uses (asserted by the packaging test, which scans the built bundle for
// the newest runtime feature and compares), and copied into the artifact
// manifest's engines field by pack.mjs.
export const NODE_MINIMUM = '16.7.0';

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
