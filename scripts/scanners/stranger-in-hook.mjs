// K75 scanner, from the 23–24 November 2026 walkthrough (BT93, BT92): stranger text in unasked output. The hook's lines
// become `additionalContext`, injected into an agent's context without being asked for, so no field a stranger wrote may
// reach them. Flagged: a read of a stranger-owned field (the leaves the `foreignFields` lists name for solver and other-account
// text, as record properties) anywhere in hook.ts. Mode: report, until BT93 makes the hook facts and pointers only.
import { enclosingFunction, functionName, lineOf, parse, short, sorted, ts, visit } from './ast.mjs';

export const id = 'stranger-in-hook';
export const mode = 'report';
export const from = 'BT93, BT92: stranger text in unasked output';
export const switchesIn = 'BT93';
export const files = ['packages/box-bounty/hook.ts'];
/** Record properties holding text another account wrote (untrusted.ts foreignFields: author, fromOthers, diff, subject, …). */
export const STRANGER = new Set(['author', 'fromOthers', 'description', 'comments', 'answers', 'subject', 'diff']);

export function scan(sources) {
  const findings = [];
  for (const source of sources) {
    const sf = parse(source);
    visit(sf, node => {
      if (!ts.isPropertyAccessExpression(node) || !STRANGER.has(node.name.text)) return;
      findings.push({ file: source.file, line: lineOf(node, sf), fn: functionName(enclosingFunction(node), sf), detail: short(node.getText(sf)) });
    });
  }
  return sorted(findings);
}
