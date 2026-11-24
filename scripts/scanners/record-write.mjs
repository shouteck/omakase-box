// K75 scanner, from the 23–24 November 2026 walkthrough (BT96): a record write without a revision check. Two processes can
// each read a record and write it back, and the second write loses the first. Since BT101 every write is a named intent
// event appended under the store's sequence check (`appendEvents(root, record, intent)`): a copy patches only what it
// changed, and one path changed by two writers is refused `record-changed`. Listed: every call that writes a record.
// Mode: fail since BT101 stage 4. `appendEvents` with its intent is the one allowed write; `writeStored` is allowed only
// inside record.ts, where `appendEvents` and the new-record write wrap it. Anything else fails, `persistRecord` included
// (the generic write BT101 deleted).
import { enclosingFunction, functionName, lineOf, parse, short, sorted, ts, visit } from './ast.mjs';

export const id = 'record-write';
export const mode = 'fail';
export const from = 'BT96: a record write without a revision check';
export const switchesIn = 'BT101';
export const dirs = ['packages/box-bounty', 'packages/box-cli/src'];
const WRITERS = new Set(['persistRecord', 'writeStored', 'seedStored', 'appendEvents']);
const RECORD = 'packages/box-bounty/record.ts';

const allowedOf = (file, name, args) => {
  if (name === 'appendEvents' && args === 3) return 'a named intent event, appended under the sequence check (BT101)';
  if (name === 'writeStored' && file === RECORD && args === 3) return 'inside record.ts: the write appendEvents and the new-record write wrap';
  return null;
};

export function scan(sources) {
  const findings = [];
  for (const source of sources) {
    const sf = parse(source);
    visit(sf, node => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || !WRITERS.has(node.expression.text)) return;
      findings.push({ file: source.file, line: lineOf(node, sf), fn: functionName(enclosingFunction(node), sf), detail: short(node.getText(sf)), allowed: allowedOf(source.file, node.expression.text, node.arguments.length) });
    });
  }
  return sorted(findings);
}

export const failing = findings => findings.filter(finding => finding.allowed === null);
