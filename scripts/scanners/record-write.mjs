// K75 scanner, from the 23–24 November 2026 walkthrough (BT96): a record write without a revision check. Two processes can
// each read a record and write it back, and the second write loses the first. Listed: every call to `persistRecord` or
// `writeStored` outside its own definition. Mode: report, until BT96 gives the store a compare-and-swap; then a call that
// does not pass a revision fails.
import { enclosingFunction, functionName, lineOf, parse, short, sorted, ts, visit } from './ast.mjs';

export const id = 'record-write';
export const mode = 'report';
export const from = 'BT96: a record write without a revision check';
export const switchesIn = 'BT96';
export const dirs = ['packages/box-bounty', 'packages/box-cli/src'];
const WRITERS = new Set(['persistRecord', 'writeStored']);

export function scan(sources) {
  const findings = [];
  for (const source of sources) {
    const sf = parse(source);
    visit(sf, node => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || !WRITERS.has(node.expression.text)) return;
      findings.push({ file: source.file, line: lineOf(node, sf), fn: functionName(enclosingFunction(node), sf), detail: short(node.getText(sf)) });
    });
  }
  return sorted(findings);
}
