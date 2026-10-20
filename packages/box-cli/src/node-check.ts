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
// BT31 raised the floor to 22.13: the record store runs on node:sqlite,
// which needs no experimental flag from 22.13 onward.
export const NODE_MINIMUM = '22.13.0';

const parse = (text: string): number[] =>
  text.split('-')[0]!.split('.').map(part => Number.parseInt(part, 10) || 0);
const [needMajor, needMinor, needPatch] = parse(NODE_MINIMUM);
const [major, minor, patch] = parse(process.versions.node);
const supported = major! > needMajor!
  || (major === needMajor && (minor! > needMinor! || (minor === needMinor && patch! >= needPatch!)));
if (!supported) {
  process.stderr.write(`box refused (node-too-old): Node ${NODE_MINIMUM} or later is required — found node ${process.versions.node}; next: install it from https://nodejs.org, then rerun the command\n`);
  process.exit(3);
}

// BT31: the record store runs on node:sqlite, which Node < 24.5 still names
// experimental with a warning at module load. A 'warning' listener cannot
// hide it — Node prints warnings to stderr whether or not the event has
// listeners; only --no-warnings silences the lot, which is too broad. The
// one narrow seam is process.emitWarning itself: internals call it for the
// print, so wrap it and drop exactly the SQLite notice — name and message
// prefix — while every other warning is relayed unchanged. The same filter
// is installed by box-bounty's store module; whichever loads first owns it.
const FILTERED = Symbol.for('box-bounty.sqlite-warning-filter');
const flagged = process as unknown as Record<PropertyKey, unknown>;
if (flagged[FILTERED] !== true) {
  flagged[FILTERED] = true;
  const emitWarning = process.emitWarning;
  process.emitWarning = function (warning: string | Error, ...rest: unknown[]): void {
    const message = typeof warning === 'string' ? warning : warning?.message;
    const kind = typeof warning === 'object' && warning !== null && 'name' in warning
      ? warning.name
      : typeof rest[0] === 'string' ? rest[0] : (rest[0] as { type?: string } | undefined)?.type;
    if (kind === 'ExperimentalWarning' && typeof message === 'string' && message.startsWith('SQLite is an experimental feature')) return;
    return emitWarning.call(process, warning as never, ...(rest as never[]));
  };
}
