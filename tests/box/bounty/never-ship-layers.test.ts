// K65: never-ship (hard stop 1, create side) tested at two levels instead of one real repository per spelling.
//   Level 1, the rule as data: which path spellings the built-in rules and an owner's list match, and which they must not. Pure
//   functions, no Git, milliseconds; hundreds of cases cost less than one repository.
//   Level 2, the plumbing: one real repository holding a file for every route a path takes to the rule (tracked, untracked, nested,
//   a case alias on disk, the owner's list), planned and finalised once, with the removal report checked against level 1.
// The old tests (never-ship.test.ts) built a repository per spelling; what each of them caught is covered here, shown by breaking
// the code one place at a time (waves/K65.md).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { finalizeBounty, planBounty } from '../../../packages/box-bounty/index.js';
import { BUILTIN_RULES, loadOwnerList, matchingSkeleton } from '../../../packages/box-bounty/never-ship.js';
import { makeRepo, write } from './support.js';

const ruleOf = (path: string): string | null => BUILTIN_RULES.find(rule => rule.match(path))?.name ?? null;

// path -> the built-in rule that must name it, or null when nothing may
const CASES: readonly (readonly [string, string | null])[] = [
  // env files, every spelling the old tests used and the neighbours
  ['.env', 'dot-env'], ['.ENV', 'dot-env'], ['config/.Env.Production', 'dot-env'], ['a/b/c/deep/.env.local', 'dot-env'], ['prod.env', 'dot-env'],
  ['config/staging.env', 'dot-env'], ['.envrc', 'dot-env'], ['.envrc.local', 'dot-env'],
  // a directory named for secrets: plural only
  ['secrets/api.key', 'secrets-dir'], ['SECRETS/Api.KEY', 'secrets-dir'], ['secrets-backup/api.txt', 'secrets-dir'], ['mysecrets/db.txt', 'secrets-dir'],
  // key material
  ['token.pem', 'private-key'], ['UPPER/key.PEM', 'private-key'], ['keys/id_ed25519', 'private-key'], ['keys/id_rsa.pub', 'private-key'],
  ['id_rsa_backup', 'private-key'], ['keys/id_rsa.old', 'private-key'], ['store/p12bundle.p12', 'private-key'], ['a/b.ppk', 'private-key'], ['x.keystore', 'private-key'],
  // certificates
  ['tls/server.crt', 'certificate'], ['tls/server.cer', 'certificate'], ['tls/ca.cert', 'certificate'], ['tls/bundle.p7b', 'certificate'], ['tls/bundle.p7c', 'certificate'], ['tls/material.asc', 'certificate'],
  // credential stores
  ['.aws/credentials', 'credentials-file'], ['home/.aws/credentials', 'credentials-file'], ['.npmrc', 'credentials-file'], ['.yarnrc', 'credentials-file'], ['.yarnrc.yml', 'credentials-file'],
  ['.docker/config.json', 'credentials-file'], ['x/.netrc', 'credentials-file'], ['.pgpass', 'credentials-file'], ['.git-credentials', 'credentials-file'],
  // the project's own and Git's own state
  ['.git/config', 'dot-git'], ['sub/.git/HEAD', 'dot-git'], ['.box/bounties/bt-1.json', 'dot-box'], ['.runtime/cache', 'runtime-dir'],
  // look-alikes the fold must see through: Cyrillic e, a zero-width character, a full-width dot
  ['.еnv', 'dot-env'], ['sеcrets/x', 'secrets-dir'], ['.e​nv', 'dot-env'], ['．env', 'dot-env'],
  // nothing may match: ordinary words and files that only look related
  ['secretary/minutes.txt', null], ['secretariat/x.md', null], ['src/app.py', null], ['TASK.md', null], ['notes.txt', null], ['open.txt', null],
  ['.boxignore', null], ['environment.ts', null], ['src/envelope.py', null], ['docs/keyboard.md', null], ['monkey.py', null], ['license.txt', null],
  ['.github/workflows/ci.yml', null], ['data/file.key2', null], ['a.pem.txt', null], ['certs.md', null], ['envrc.md', null], ['.gitignore', null], ['.gitattributes', null]
];

describe('K65 level 1: the built-in rules as data', () => {
  // @guards C1
  it.each(CASES)('%s is named by %s', (path, rule) => {
    expect(ruleOf(path)).toBe(rule);
  });

  // A seeded generator, not a library: the same cases on every run and system. The property: the rule an input is named by does not
  // change under case, a prefix directory, or an invisible character inside a name; and what no rule names stays unnamed.
  // @guards C1
  it('the verdict is stable under case flips, a prefix directory and invisible characters (seeded, 40 variants of every case)', () => {
    let seed = 0x2545f491;
    const next = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    const flips = (text: string): string => [...text].map(ch => (next() < 0.5 ? ch.toUpperCase() : ch)).join('');
    const prefixes = ['', 'a/', 'x/y/z/', 'src/lib/'];
    const invisible = ['​', '‍', '﻿'];
    const wrong: string[] = [];
    for (const [path, rule] of CASES) {
      if (/[^\x00-\x7f]/.test(path)) continue; // the look-alike rows above already carry their own non-ASCII
      for (let n = 0; n < 40; n += 1) {
        let variant = prefixes[Math.floor(next() * prefixes.length)]! + flips(path);
        if (next() < 0.3) { const at = 1 + Math.floor(next() * Math.max(1, variant.length - 1)); variant = variant.slice(0, at) + invisible[Math.floor(next() * invisible.length)] + variant.slice(at); }
        const got = ruleOf(variant);
        if (got !== rule) wrong.push(`${JSON.stringify(variant)} -> ${got} (expected ${rule})`);
      }
    }
    expect(wrong).toEqual([]);
  });

  // @guards C1
  it('the fold is what catches: the same table on an unfolded path misses the look-alikes and the upper case', () => {
    expect(matchingSkeleton('SECRETS/Api.KEY')).toBe('secrets/api.key');
    expect(matchingSkeleton('.еnv')).toBe('.env');
    expect(matchingSkeleton('.e​nv')).toBe('.env');
  });
});

describe('K65 level 1: the owner list (.boxignore) as data', () => {
  const dirs: string[] = [];
  afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
  const listOf = (text: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'k65-ignore-'));
    dirs.push(dir);
    writeFileSync(join(dir, '.boxignore'), text);
    return loadOwnerList(dir)!.rule;
  };

  // @guards C1
  it('a directory pattern covers anything under a directory of that name at any depth, not a file or a longer name', () => {
    const rule = listOf('proprietary/\n');
    expect(rule.match('proprietary/algo.py')).toBe(true);
    expect(rule.match('src/proprietary/deep/algo.py')).toBe(true);
    expect(rule.match('proprietary')).toBe(false);
    expect(rule.match('proprietary-notes/a.txt')).toBe(false);
    expect(rule.match('src/app.py')).toBe(false);
  });

  // @guards C1
  it('a basename glob matches at any depth; an anchored path glob only at the root', () => {
    const rule = listOf('*.lic\n/docs/*.pdf\nvendor/*.bin\n');
    expect(rule.match('licenses/dataset.lic')).toBe(true);
    expect(rule.match('dataset.lic')).toBe(true);
    expect(rule.match('docs/a.pdf')).toBe(true);
    expect(rule.match('x/docs/a.pdf')).toBe(false);
    expect(rule.match('vendor/a.bin')).toBe(true);
    expect(rule.match('x/vendor/a.bin')).toBe(false);
  });

  // @guards C1
  it('both sides are folded: an upper-case pattern matches a lower-case path and the other way round', () => {
    const rule = listOf('SecretDir/\n*.KEY2\n');
    expect(rule.match('secretdir/inside.txt')).toBe(true);
    expect(rule.match('SECRETDIR/inside.txt')).toBe(true);
    expect(rule.match('data/file.key2')).toBe(true);
    expect(rule.match('data/FILE.Key2')).toBe(true);
    expect(rule.match('data/file.key3')).toBe(false);
  });

  // @guards C1
  it('comments and blank lines are skipped, and a list can only remove: it never matches what it does not name', () => {
    const rule = listOf('# keep these inside\n\nproprietary/\n');
    expect(rule.match('src/app.py')).toBe(false);
    expect(rule.match('proprietary/x')).toBe(true);
  });
});

describe('K65 level 2: one repository, every route a path takes to the rule', () => {
  // @guards C1
  it('removes exactly what the rules name, whichever way the file arrived, and reports each removal under the rule level 1 names', () => {
    const repo = makeRepo({
      'src/app.py': 'x\n',
      // tracked
      'secrets/api.key': 'fake-tracked-key\n',
      'a/b/c/deep/.env.local': 'fake-nested\n',
      'a/b/c/deep/notes.txt': 'ok\n',
      'keys/id_ed25519': 'fake\n',
      'tls/server.crt': 'fake\n',
      '.npmrc': '//registry/:_authToken=fake\n',
      'prod.env': 'fake\n',
      'secretary/minutes.txt': 'kept — plural-only rule must not hit ordinary words\n',
      // the owner's list, tracked
      'proprietary/algo.py': 'fake-proprietary\n',
      'licenses/dataset.lic': 'fake-license\n',
      'secretdir/inside.txt': 'fake\n',
      'data/file.key2': 'fake\n',
      'open.txt': 'keep\n',
      '.boxignore': '# keep these inside\nproprietary/\n*.lic\nSecretDir/\n*.KEY2\n'
    }, repo => {
      // untracked, and a case alias on disk
      write(repo, 'token.pem', 'fake-untracked\n');
      write(repo, 'SECRETS-BAK/Api.KEY', 'fake-case\n'); // upper case, and not the same file as the tracked secrets/ on a case-folding file system
      write(repo, '.ENV', 'fake-env\n');
      write(repo, 'UPPER/key.PEM', 'fake-pem\n');
    });
    write(repo, 'TASK.md', 'the task\n');
    const result = finalizeBounty(planBounty({ repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md') }));
    const shipped = result.plan.files.map(file => file.path).sort();

    // what stays: exactly these
    expect(shipped).toEqual(['.boxignore', 'TASK.md', 'a/b/c/deep/notes.txt', 'open.txt', 'secretary/minutes.txt', 'src/app.py']);

    // what goes, by rule; the case-aliased and untracked paths are reported under the spelling Git knows (case folded for the on-disk alias)
    const removed = new Map(result.plan.ruleRemovals.map(entry => [entry.rule, entry.paths.map(path => path.toLowerCase()).sort()]));
    expect(removed.get('secrets-dir')).toEqual(['secrets-bak/api.key', 'secrets/api.key']);
    expect(removed.get('dot-env')).toEqual(expect.arrayContaining(['.env', 'a/b/c/deep/.env.local', 'prod.env']));
    expect(removed.get('private-key')).toEqual(expect.arrayContaining(['keys/id_ed25519', 'token.pem', 'upper/key.pem']));
    expect(removed.get('certificate')).toEqual(['tls/server.crt']);
    expect(removed.get('credentials-file')).toEqual(['.npmrc']);
    expect(removed.get('owner-list')).toEqual(['data/file.key2', 'licenses/dataset.lic', 'proprietary/algo.py', 'secretdir/inside.txt']);

    // the two levels agree: every built-in removal is under the rule the data names for that path
    for (const entry of result.plan.ruleRemovals) {
      if (entry.rule === 'owner-list') continue;
      for (const path of entry.paths) expect(ruleOf(path), path).toBe(entry.rule);
    }
  });
});
