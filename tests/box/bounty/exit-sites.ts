// Every place the tool can send something off this machine, read with the TypeScript parser (BT82): the work list for
// one door out. It walks packages/box-bounty and packages/box-cli/src as refusal-sites.ts does and reports each call by
// kind, naming the function it sits in (lines move; the enclosing function is the stable name):
//   git-push      a Git call whose argument array holds the literal 'push' (remoteGit, git, gitOutcome, gitStdin…)
//   github-write  `api(root, endpoint, payload, …)` — a payload makes `gh api` a POST/PATCH — except a GraphQL
//                 query (endpoint 'graphql' whose query text, a literal or a same-file const, holds no `mutation`)
//   graphql-read  that GraphQL exception, listed so the count shows what was set aside
//   board-send    `boardCalls(…)` whose calls carry a `body` (the board's one POST, the hint)
//   unknown       anything that could reach the network outside the known plumbing: a `fetch(` call, an import of
//                 node:http/https/net/tls/dgram or undici, or a child process started with `-e` or a `gh`/`curl`
//                 literal outside the files that are the plumbing — the test refuses any of these
// The plumbing itself (the functions that turn these calls into a process or a socket) is named in PLUMBING and
// checked to still exist, so a rename cannot make the walk silently miss the layer under it.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import * as ts from 'typescript';

export const ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['packages/box-bounty', 'packages/box-cli/src'];

export type ExitKind = 'git-push' | 'github-write' | 'graphql-read' | 'board-send' | 'unknown';
export interface ExitSite { readonly file: string; readonly line: number; readonly fn: string; readonly kind: ExitKind; readonly detail: string }

// The layer every exit above runs through, by file and function. Calls inside these are the mechanism, not exits.
export const PLUMBING: Readonly<Record<string, readonly string[]>> = {
  'packages/box-bounty/gh.ts': ['api', 'gh', 'remoteGit'],
  'packages/box-bounty/gh-direct.ts': ['requestOf'],
  'packages/box-bounty/board.ts': ['boardCalls'],
  'packages/box-bounty/git.ts': ['gitOutcome']
};
const PLUMBING_FILES = new Set(Object.keys(PLUMBING));
const GIT_CALLS = new Set(['remoteGit', 'git', 'gitOutcome', 'gitStdin', 'gitStdinOutcome', 'ownerGitOutcome']);
const SPAWNS = new Set(['spawnSync', 'spawn', 'execFileSync', 'execFile', 'execSync', 'exec']);
const NETWORK_MODULES = new Set(['node:http', 'node:https', 'node:net', 'node:tls', 'node:dgram', 'http', 'https', 'net', 'tls', 'dgram', 'undici']);

const files = (): string[] => {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) found.push(join(dir, entry.name));
    }
  };
  SCAN_DIRS.forEach(walk);
  return found;
};

// The name a reader would look for: the nearest enclosing function, method or named arrow.
function enclosing(node: ts.Node, sf: ts.SourceFile): string {
  for (let at: ts.Node | undefined = node.parent; at !== undefined; at = at.parent) {
    if ((ts.isFunctionDeclaration(at) || ts.isMethodDeclaration(at)) && at.name !== undefined) return at.name.getText(sf);
    if ((ts.isArrowFunction(at) || ts.isFunctionExpression(at)) && ts.isVariableDeclaration(at.parent)) return at.parent.name.getText(sf);
  }
  return '(top level)';
}

// A same-file `const NAME = <initializer>`: the text a GraphQL query identifier stands for.
function constText(sf: ts.SourceFile, name: string): string | null {
  let text: string | null = null;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === name && node.initializer !== undefined) text = node.initializer.getText(sf);
    if (text === null) ts.forEachChild(node, visit);
  };
  visit(sf);
  return text;
}

function graphqlIsQuery(payload: ts.Expression, sf: ts.SourceFile): boolean | null {
  if (!ts.isObjectLiteralExpression(payload)) return null;
  const query = payload.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'query') as ts.PropertyAssignment | undefined
    ?? payload.properties.find(p => ts.isShorthandPropertyAssignment(p) && p.name.getText(sf) === 'query') as ts.ShorthandPropertyAssignment | undefined;
  if (query === undefined) return null;
  const value = ts.isPropertyAssignment(query) ? query.initializer : query.name;
  const text = ts.isIdentifier(value) ? constText(sf, value.getText(sf)) : value.getText(sf);
  if (text === null) return null;
  return !/\bmutation\b/.test(text);
}

const short = (text: string): string => text.replace(/\s+/g, ' ').slice(0, 80);

export const collectExits = (): ExitSite[] => {
  const sites: ExitSite[] = [];
  for (const file of files()) {
    const rel = file.split(sep).join('/');
    const sf = ts.createSourceFile(rel, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true);
    const plumbing = PLUMBING_FILES.has(rel);
    const add = (node: ts.Node, kind: ExitKind, detail: string) => {
      const fn = enclosing(node, sf);
      // Inside a plumbing function the call is the mechanism, not an exit.
      if (plumbing && kind !== 'unknown' && PLUMBING[rel]!.includes(fn)) return;
      sites.push({ file: rel, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, fn, kind, detail: short(detail) });
    };
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && NETWORK_MODULES.has(node.moduleSpecifier.text)) {
        add(node, 'unknown', `import ${node.moduleSpecifier.text}`);
      }
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(sf);
        const args = node.arguments;
        if (GIT_CALLS.has(callee) && args.some(arg => ts.isArrayLiteralExpression(arg) && arg.elements.some(el => ts.isStringLiteral(el) && el.text === 'push'))) {
          const refspec = args.filter(ts.isArrayLiteralExpression).flatMap(arg => arg.elements.map(el => el.getText(sf))).join(' ');
          add(node, 'git-push', `${callee} ${refspec}`);
        } else if (callee === 'api' && args.length >= 3) {
          const endpoint = args[1]!;
          if (ts.isStringLiteral(endpoint) && endpoint.text === 'graphql') {
            const isQuery = graphqlIsQuery(args[2]!, sf);
            add(node, isQuery === true ? 'graphql-read' : 'github-write', `api graphql${isQuery === null ? ' (query unreadable)' : ''}`);
          } else {
            add(node, 'github-write', `api ${endpoint.getText(sf)}${args[3] !== undefined ? ` ${args[3].getText(sf)}` : ''}`);
          }
        } else if (callee === 'boardCalls' && args.length >= 1 && /\bbody\s*:/.test(args[0]!.getText(sf))) {
          add(node, 'board-send', `boardCalls ${args[0]!.getText(sf)}`);
        } else if (callee === 'fetch' || callee.endsWith('.fetch')) {
          add(node, 'unknown', `fetch ${args[0]?.getText(sf) ?? ''}`);
        } else if (SPAWNS.has(callee) && !plumbing && args.some(arg => /'-e'|"-e"|'gh'|"gh"|'curl'|"curl"/.test(arg.getText(sf)))) {
          add(node, 'unknown', `${callee} ${args.map(arg => arg.getText(sf)).join(' ')}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return sites;
};

// Each PLUMBING function, found as a declaration (function or const arrow) in its file — or null when it is gone.
export const missingPlumbing = (): string[] => Object.entries(PLUMBING).flatMap(([file, names]) => {
  const sf = ts.createSourceFile(file, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const declared = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) declared.add(node.name.getText(sf));
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) declared.add(node.name.getText(sf));
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names.filter(name => !declared.has(name)).map(name => `${file} ${name}`);
});
