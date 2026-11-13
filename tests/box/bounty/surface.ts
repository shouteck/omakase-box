// BT62: what an agent can depend on, on record in tests/box/bounty/SURFACE.txt, so it changes only on purpose. Nothing is frozen
// (the version stays below 1.0): a change fails a test until the record is updated, and the record's diff in the commit is
// how the change is seen. Two halves, both derived from the code or its output, never typed:
// - the static half (commands, options, positionals, exit codes, held answers, refusal names), read from the option table
//   the parser uses and from the source with the TypeScript parser; bt62.test.ts compares it;
// - the fields of every --json document, read from the documents the existing JSON tests already print. Each schema has
//   exactly one owner test (OWNERS); that file calls `watchFields(...)` and checks its schemas when it ends. No test runs a
//   command for the record's sake.
// `node scripts/surface.mjs` runs bt62 and the owners and fails on any difference; `--write` rewrites the record from them.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { expect } from 'vitest';
import { BOUNTY_COMMANDS, SETUP_USAGE } from '../../../packages/box-bounty/index.js';
import { collectSites, ROOT } from './refusal-sites.js';

// Beside its tests, not under docs/: docs/** is inert to verify and the hosted run, so a change to the record alone there
// could pass on an earlier result without the comparison running.
export const SURFACE_FILE = join(ROOT, 'tests', 'box', 'bounty', 'SURFACE.txt');
export const UPDATE = 'update the record on purpose: node scripts/surface.mjs --write';
/** Set by `scripts/surface.mjs --write`: a folder each part writes its lines to, merged into SURFACE.txt afterwards. */
const WRITE_DIR = process.env['BT62_WRITE'];

/** The one test file that checks each document's fields: the file whose runs print that document in the most states. */
export const OWNERS: Readonly<Record<string, string>> = {
  'box-bounty/status@1': 'json-agreement', 'box-bounty/config@1': 'json-agreement', 'box-bounty/look@1': 'json-agreement',
  'box-bounty/describe@1': 'bt61-journey', 'box-bounty/help@1': 'bt61-journey', 'box-bounty/create@1': 'bt61-journey',
  'box-bounty/post@1': 'bt61-journey', 'box-bounty/allow@1': 'bt61-journey', 'box-bounty/apply@1': 'bt61-journey',
  'box-bounty/close@1': 'bt61-journey', 'box-bounty/hook@1': 'bt61-journey', 'box-bounty/deny@1': 'bt61-journey',
  'box-bounty/setup@1': 'bt61-journey',
  'box-bounty/refusal@1': 'bt61',
  'box-bounty/take@1': 'bt61-solver', 'box-bounty/submit@1': 'bt61-solver',
  'box-bounty/discover@1': 'pf24',
  'box-bounty/find@1': 'bt28',
  'box-bounty/look-export@1': 'bt43'
};

const recordLines = (): string[] => readFileSync(SURFACE_FILE, 'utf8').split('\n').filter(line => line !== '');

/** `added: …` / `removed: …` for each line in one set and not the other (a changed type shows as one of each). */
export const difference = (derived: readonly string[], recorded: readonly string[]): string[] => {
  const have = new Set(recorded);
  const want = new Set(derived);
  return [...derived.filter(line => !have.has(line)).map(line => `added: ${line}`), ...recorded.filter(line => !want.has(line)).map(line => `removed: ${line}`)].sort();
};

const fail = (what: string, diff: readonly string[]) =>
  expect(diff.join('\n'), `${what} differs from tests/box/bounty/SURFACE.txt:\n${diff.join('\n')}\n${UPDATE}`).toBe('');

const writePart = (name: string, lines: readonly string[]) => {
  mkdirSync(WRITE_DIR!, { recursive: true });
  writeFileSync(join(WRITE_DIR!, `${name.replace(/[^a-z0-9@-]+/gi, '_')}.txt`), lines.join('\n') + '\n');
};

// ---------------------------------------------------------------------------------------------------------------------
// The static half.

const source = (file: string): ts.SourceFile => ts.createSourceFile(file, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true);
const literal = (node: ts.Node | undefined): string | undefined =>
  node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
const eachNode = (sf: ts.SourceFile, visit: (node: ts.Node) => void) => { const walk = (node: ts.Node) => { visit(node); ts.forEachChild(node, walk); }; walk(sf); };

/** Every `process.exit(<number>)` in the CLI entry points. */
export const exitCodes = (): number[] => {
  const codes = new Set<number>();
  const dir = 'packages/box-cli/src';
  for (const name of readdirSync(join(ROOT, dir)).filter(file => file.endsWith('.ts'))) {
    eachNode(source(`${dir}/${name}`), node => {
      if (ts.isCallExpression(node) && node.expression.getText() === 'process.exit' && node.arguments[0] !== undefined && ts.isNumericLiteral(node.arguments[0])) codes.add(Number(node.arguments[0].text));
    });
  }
  return [...codes].sort();
};
// What each code means, from the catch block of packages/box-cli/src/bounty.ts and the usage path; a code not named here
// is recorded as `unnamed`, so a new one shows as an addition.
const EXIT_MEANING: Readonly<Record<number, string>> = { 0: 'done, or an answer held for the owner', 1: 'failed', 2: 'usage', 3: 'refused' };

/** The refusals a program gets with exit 0: the array literal tested with `.includes(error.reason)` in bounty.ts. */
export const heldReasons = (): string[] => {
  const held: string[] = [];
  eachNode(source('packages/box-cli/src/bounty.ts'), node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'includes'
      && node.arguments[0]?.getText() === 'error.reason' && ts.isArrayLiteralExpression(node.expression.expression)) {
      for (const element of node.expression.expression.elements) { const text = literal(element); if (text !== undefined) held.push(text); }
    }
  });
  return held.sort();
};

/** Refusal names: the literal first argument at every refusal site, plus the `refused` names a refusal document is built with. */
export const refusalNames = (): { names: string[]; computed: string[] } => {
  const names = new Set<string>();
  const computed: string[] = [];
  for (const site of collectSites().filter(each => !each.excepted)) {
    const match = /^(['"`])([a-z0-9-]+)\1$/.exec(site.reason);
    if (match !== null) names.add(match[2]!);
    else computed.push(`${site.file}:${site.line} ${site.reason}`);
  }
  eachNode(source('packages/box-cli/src/bounty.ts'), node => {
    if (ts.isCallExpression(node) && node.expression.getText() === 'refusalDocument') { const text = literal(node.arguments[1]); if (text !== undefined) names.add(text); }
  });
  return { names: [...names].sort(), computed };
};

export const staticLines = (): string[] => {
  const lines: string[] = [];
  for (const [name, spec] of Object.entries(BOUNTY_COMMANDS)) {
    lines.push(`command ${name}`, `positionals ${name} ${spec.positionals}`);
    for (const [flag, rule] of Object.entries(spec.values ?? {})) lines.push(`option ${name} ${flag} value${rule.repeatable === true ? ' repeatable' : ''}`);
    for (const flag of Object.keys(spec.switches ?? {})) lines.push(`option ${name} ${flag} switch`);
    lines.push(`option ${name} --help switch`, `option ${name} -h switch`);
  }
  // setup has its own parser (setup.ts runSetupCommand): its options are the ones its usage line names, plus --help, -h, --json.
  lines.push('command setup', 'positionals setup 0');
  for (const flag of new Set([...(SETUP_USAGE[0]!.match(/--[a-z-]+/g) ?? []), '--help', '-h', '--json'])) lines.push(`option setup ${flag} switch`);
  for (const code of exitCodes()) lines.push(`exit ${code} ${EXIT_MEANING[code] ?? 'unnamed'}`);
  for (const reason of heldReasons()) lines.push(`held ${reason}`);
  for (const reason of refusalNames().names) lines.push(`refusal ${reason}`);
  for (const schema of Object.keys(OWNERS)) lines.push(`schema ${schema}`);
  return [...new Set(lines)].sort();
};

const isStatic = (line: string) => !line.startsWith('field ');

/** bt62: the static half against the record, or (under --write) the static half written for the merge. */
export const checkStatic = () => {
  const derived = staticLines();
  if (WRITE_DIR !== undefined) { writePart('static', derived); return; }
  fail('the static surface', difference(derived, recordLines().filter(isStatic)));
};

// ---------------------------------------------------------------------------------------------------------------------
// The fields of the --json documents.

const typeOf = (value: unknown): string => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * One line per path: `field <schema> <path> <types> [optional]`. An array's elements are `[]`; an object whose keys are not
 * names (an id, a path) is a map, `{}`. A key is optional when some object at its parent path lacks it.
 */
export const fieldLines = (schema: string, documents: readonly unknown[]): string[] => {
  const objects = new Map<string, number>();
  const fields = new Map<string, { parent: string | null; count: number; types: Set<string> }>();
  const note = (path: string, parent: string | null, value: unknown) => {
    const entry = fields.get(path) ?? { parent, count: 0, types: new Set<string>() };
    entry.count += 1;
    entry.types.add(typeOf(value));
    fields.set(path, entry);
  };
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      for (const element of value) { note(`${path}[]`, null, element); walk(element, `${path}[]`); }
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const entries = Object.entries(value as Record<string, unknown>);
    if (path !== '' && entries.length > 0 && entries.every(([key]) => !NAME.test(key))) {
      for (const [, element] of entries) { note(`${path}{}`, null, element); walk(element, `${path}{}`); }
      return;
    }
    objects.set(path, (objects.get(path) ?? 0) + 1);
    for (const [key, element] of entries) {
      const child = path === '' ? key : `${path}.${key}`;
      note(child, path, element);
      walk(element, child);
    }
  };
  for (const document of documents) walk(document, '');
  return [...fields].map(([path, { parent, count, types }]) =>
    `field ${schema} ${path} ${[...types].sort().join('|')}${parent !== null && count < (objects.get(parent) ?? 0) ? ' optional' : ''}`).sort();
};

/**
 * In an owner test file: `const fields = watchFields('json-agreement')`, pass each parsed document through `fields.see`,
 * and `afterAll(fields.check)`. It checks the schemas OWNERS gives that file and ignores the rest.
 */
export const watchFields = (owner: string) => {
  const owned = Object.keys(OWNERS).filter(schema => OWNERS[schema] === owner);
  if (owned.length === 0) throw new Error(`${owner} owns no schema in OWNERS`);
  const seen = new Map<string, unknown[]>();
  const see = <T>(document: T): T => {
    const schema = (document as { schema?: unknown } | null)?.schema;
    if (typeof schema === 'string' && owned.includes(schema)) seen.set(schema, [...(seen.get(schema) ?? []), document]);
    return document;
  };
  const check = () => {
    const missing = owned.filter(schema => !seen.has(schema));
    expect(missing, `${owner} owns these documents but printed none of them, so their fields cannot be checked`).toEqual([]);
    const derived = owned.flatMap(schema => fieldLines(schema, seen.get(schema)!));
    if (WRITE_DIR !== undefined) { writePart(`fields-${owner}`, derived); return; }
    const recorded = recordLines().filter(line => owned.some(schema => line.startsWith(`field ${schema} `)));
    fail(`the fields of ${owned.join(', ')}`, difference(derived, recorded));
  };
  return { see, check };
};
