// K75 scanner, from the 23–24 November 2026 walkthrough (BT100): a read that writes outward. `look`, `status`, `find`,
// `describe` and `discover` are read commands; whatever they reach should send nothing off the machine. Listed: each
// function that sends (a Git push, a GitHub write through `api(root, endpoint, payload)`, the board's POST through
// `boardCalls` with a body, or a raw `fetch`) and is reachable by name from a read command's branch in the CLI. The graph
// is by function name across packages/box-bounty and packages/box-cli/src, so it over-reaches where two functions share a
// name, never under-reaches a direct call. tests/box/bounty/exit-sites.ts is the full exit walk; this is its read-side view.
// Mode: fail since BT101 stage 3, where a read only owes: the hand-merge scan, the chain refresh and collection inside a
// read append and owe, and the next mutating command sends. Since stage 4 the board hint is owed too
// (D-2026-11-25-board-hint-behind-the-door), so no read send is allowed: the list below is empty on purpose.
import { enclosingFunction, functionName, lineOf, parse, short, ts, visit } from './ast.mjs';

export const id = 'read-writes-outward';
export const mode = 'fail';
export const from = 'BT100: a read that writes outward';
export const switchesIn = 'BT101';

/** `file#function: kind` → why a read may send it. None: a read sends nothing (BT101). */
export const ALLOWED = {};
export const failing = findings => findings.filter(finding => finding.allowed === null);
export const dirs = ['packages/box-bounty', 'packages/box-cli/src'];
export const READ_COMMANDS = ['look', 'status', 'find', 'describe', 'discover'];
export const CLI = 'packages/box-cli/src/bounty.ts';

// BT101 stage 3: `if (!inRead()) <send>` runs only outside a read. The CLI marks each read command's process read
// (`readOnlyProcess()`), so a call under that guard is not reached from a read, provided the CLI does mark them; scan()
// checks it does, and otherwise counts the guarded calls too.
const READ_GUARD = '!inRead()';
const calledNames = (node, sf, guarded = true) => {
  const names = new Set();
  const go = inner => {
    if (guarded && ts.isIfStatement(inner) && inner.expression.getText(sf) === READ_GUARD) {
      if (inner.elseStatement !== undefined) go(inner.elseStatement);
      return;
    }
    if (ts.isCallExpression(inner)) {
      const callee = inner.expression;
      if (ts.isIdentifier(callee)) names.add(callee.text);
      else if (ts.isPropertyAccessExpression(callee)) names.add(callee.name.text);
    }
    ts.forEachChild(inner, go);
  };
  go(node);
  return names;
};
// A call inside the then-branch of `if (!inRead())`.
const underGuard = (node, sf) => {
  for (let at = node; at.parent !== undefined; at = at.parent) {
    if (ts.isIfStatement(at.parent) && at.parent.thenStatement === at && at.parent.expression.getText(sf) === READ_GUARD) return true;
  }
  return false;
};
// The CLI's read branches are marked read when the dispatcher calls readOnlyProcess() for every read command.
const marksReads = text => /readOnlyProcess\(\)/.test(text) && READ_COMMANDS.every(name => text.includes(`'${name}'`));

function sends(call, sf) {
  if (!ts.isIdentifier(call.expression)) return null;
  const name = call.expression.text;
  const args = call.arguments.map(arg => arg.getText(sf));
  if (name === 'fetch') return 'fetch';
  // A GraphQL query is a read; only a mutation writes.
  if (name === 'api' && /^['"`]graphql['"`]$/.test(args[1] ?? '') && !/mutation/.test(call.getText(sf))) return null;
  if (name === 'api' && call.arguments.length >= 3 && args[2] !== 'undefined' && args[2] !== 'null') return 'github-write';
  if (name === 'boardCalls' && /\bbody\b/.test(call.getText(sf))) return 'board-send';
  if (['remoteGit', 'git', 'gitOutcome', 'gitStdin', 'gitStdinOutcome', 'ownerGitOutcome'].includes(name) && call.arguments.some(arg => /['"`]push['"`]/.test(arg.getText(sf)))) return 'git-push';
  return null;
}

export function scan(sources) {
  const callsOf = new Map();
  const exits = [];
  let entries = new Set();
  const cli = sources.find(source => source.file === CLI);
  const guarded = cli !== undefined && marksReads(cli.text);
  for (const source of sources) {
    const sf = parse(source);
    visit(sf, node => {
      if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined) {
        const set = callsOf.get(node.name.text) ?? new Set();
        for (const name of calledNames(node.body, sf, guarded)) set.add(name);
        callsOf.set(node.name.text, set);
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
        const set = callsOf.get(node.name.text) ?? new Set();
        for (const name of calledNames(node.initializer, sf, guarded)) set.add(name);
        callsOf.set(node.name.text, set);
      }
      if (ts.isCallExpression(node) && !(guarded && underGuard(node, sf))) {
        const kind = sends(node, sf);
        if (kind !== null) exits.push({ file: source.file, line: lineOf(node, sf), fn: functionName(enclosingFunction(node), sf), kind, detail: short(node.getText(sf)) });
      }
      // The CLI's read branches: `subcommand === '<read>'`, everything they call is an entry.
      if (source.file === CLI && ts.isIfStatement(node)) {
        const read = /^subcommand === '([a-z]+)'$/.exec(node.expression.getText(sf));
        if (read !== null && READ_COMMANDS.includes(read[1])) entries = new Set([...entries, ...calledNames(node.thenStatement, sf)]);
      }
    });
  }
  const reached = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const name = queue.shift();
    if (reached.has(name)) continue;
    reached.add(name);
    for (const next of callsOf.get(name) ?? []) if (!reached.has(next)) queue.push(next);
  }
  return exits.filter(exit => reached.has(exit.fn)).map(exit => ({ file: exit.file, line: exit.line, fn: exit.fn, detail: `${exit.kind}: ${exit.detail}`, allowed: ALLOWED[`${exit.file}#${exit.fn}: ${exit.kind}`] ?? null }))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
