// K75 scanner, from the 23–24 November 2026 walkthrough (BT100): a read that writes outward. `look`, `status`, `find`,
// `describe` and `discover` are read commands; whatever they reach should send nothing off the machine. Listed: each
// function that sends (a Git push, a GitHub write through `api(root, endpoint, payload)`, the board's POST through
// `boardCalls` with a body, or a raw `fetch`) and is reachable by name from a read command's branch in the CLI. The graph
// is by function name across packages/box-bounty and packages/box-cli/src, so it over-reaches where two functions share a
// name, never under-reaches a direct call. tests/box/bounty/exit-sites.ts is the full exit walk; this is its read-side view.
// Mode: report, until BT100 settles reads and writes.
import { enclosingFunction, functionName, lineOf, parse, short, ts, visit } from './ast.mjs';

export const id = 'read-writes-outward';
export const mode = 'report';
export const from = 'BT100: a read that writes outward';
export const switchesIn = 'BT100';
export const dirs = ['packages/box-bounty', 'packages/box-cli/src'];
export const READ_COMMANDS = ['look', 'status', 'find', 'describe', 'discover'];
export const CLI = 'packages/box-cli/src/bounty.ts';

const calledNames = (node, sf) => {
  const names = new Set();
  visit(node, inner => {
    if (ts.isCallExpression(inner)) {
      const callee = inner.expression;
      if (ts.isIdentifier(callee)) names.add(callee.text);
      else if (ts.isPropertyAccessExpression(callee)) names.add(callee.name.text);
    }
  });
  return names;
};

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
  for (const source of sources) {
    const sf = parse(source);
    visit(sf, node => {
      if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined) {
        const set = callsOf.get(node.name.text) ?? new Set();
        for (const name of calledNames(node.body, sf)) set.add(name);
        callsOf.set(node.name.text, set);
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
        const set = callsOf.get(node.name.text) ?? new Set();
        for (const name of calledNames(node.initializer, sf)) set.add(name);
        callsOf.set(node.name.text, set);
      }
      if (ts.isCallExpression(node)) {
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
  return exits.filter(exit => reached.has(exit.fn)).map(exit => ({ file: exit.file, line: exit.line, fn: exit.fn, detail: `${exit.kind}: ${exit.detail}` }))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
