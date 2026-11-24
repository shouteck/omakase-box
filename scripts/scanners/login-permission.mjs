// K75 scanner, from the 23–24 November 2026 walkthrough (PF61): a permission decided by login name. A login can change hands,
// so a function that decides a role or an access on the board must compare GitHub IDs. Flagged: a `same(` call, or an
// `===`/`!==` with a `.login`/`login` side, inside a function that decides access, which is a function named `roleOf`,
// `*Allowed`, `is*`, `may*` or `can*`, one declared to return `Role`, or one that answers 401 or 403. A name match that
// is not a permission is allow-listed with its reason. Mode: fail (PF61 established the rule).
import { enclosingFunction, functionName, lineOf, parse, short, sorted, ts, visit } from './ast.mjs';

export const id = 'login-permission';
export const mode = 'fail';
export const from = 'PF61: who-may-see was decided by login name';
export const dirs = ['packages/box-platform/src'];

/** `file#function: call text` → why it is a name match, not a permission. */
export const ALLOWED = {
  'packages/box-platform/src/account.ts#recordPaid: same(pull.author, sent.to as string)': 'matches the name the owner typed against this bounty\'s own merged authors; the role was decided by ID above',
  'packages/box-platform/src/account.ts#recordPaid: same(payeeOf(facts), named)': 'compares two names from this bounty\'s own merged authors (the recorded payee and the one named again)'
};

const DECIDES = /^(roleOf|.*Allowed|is[A-Z].*|may[A-Z].*|can[A-Z].*)$/;
const LOGIN_SIDE = /(^|\.)login$/;

function decidesAccess(fn, sf) {
  if (fn === null) return false;
  if (DECIDES.test(functionName(fn, sf))) return true;
  if (fn.type !== undefined && /\bRole\b/.test(fn.type.getText(sf))) return true;
  return /\bjson\(\s*40[13]\b/.test(fn.body?.getText(sf) ?? '');
}

export function scan(sources) {
  const findings = [];
  for (const source of sources) {
    const sf = parse(source);
    visit(sf, node => {
      const isSame = ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'same';
      // A check for null or undefined is not an identity comparison.
      const nothing = side => side.kind === ts.SyntaxKind.NullKeyword || side.getText(sf) === 'undefined';
      const isLoginCompare = ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.operatorToken.kind)
        && (LOGIN_SIDE.test(node.left.getText(sf)) || LOGIN_SIDE.test(node.right.getText(sf))) && !nothing(node.left) && !nothing(node.right);
      if (!isSame && !isLoginCompare) return;
      const fn = enclosingFunction(node);
      if (!decidesAccess(fn, sf)) return;
      const detail = short(node.getText(sf));
      const key = `${source.file}#${functionName(fn, sf)}: ${detail}`;
      findings.push({ file: source.file, line: lineOf(node, sf), fn: functionName(fn, sf), detail, allowed: ALLOWED[key] ?? null });
    });
  }
  return sorted(findings);
}

/** Findings that fail the scan: those with no allow-list reason. */
export const failing = findings => findings.filter(finding => finding.allowed === null);
