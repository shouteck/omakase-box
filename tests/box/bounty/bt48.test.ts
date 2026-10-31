import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILTIN_RULES, BountyRefused, changePublishList, finalizeBounty, planBounty, publishListed, shipRules } from '../../../packages/box-bounty/index.js';
import { CONFUSABLES, UNFOLDED_RULES, matchingSkeleton } from '../../../packages/box-bounty/never-ship.js';
import { commitStatuses, neverShipViolations } from '../../../packages/box-bounty/publish-plan.js';
import { makeRepo, write } from './support.js';

// BT48: a path is judged by what it looks like. Look-alike spellings are refused
// under the rule the plain spelling names, and the path shown is the real one.
// Non-ASCII letters are written as escapes so the file shows which is which.

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const CYR_E = 'е';
const CYR_S = 'ѕ';
const NFD_CAFE = 'café';
const NFC_CAFE = 'café';
const fullwidth = (text: string): string => [...text].map(ch => (ch === '/' ? ch : String.fromCodePoint(ch.codePointAt(0)! + 0xfee0))).join('');

const ruleFor = (path: string): string | undefined => BUILTIN_RULES.find(rule => rule.match(path.toLowerCase()))?.name;

function ship(files: Record<string, string>) {
  const repo = makeRepo({ 'src/app.py': 'x\n', ...files });
  write(repo, 'TASK.md', 'the task\n');
  const plan = planBounty({ repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md') });
  return { shipped: finalizeBounty(plan).plan.files.map(file => file.path), plan };
}

describe('a look-alike path is refused as the plain spelling is', () => {
  it.each([
    ['Cyrillic e in a directory', `s${CYR_E}crets/api.txt`, 'secrets-dir'],
    ['Cyrillic e in a dotfile', `.${CYR_E}nv`, 'dot-env'],
    ['Cyrillic e in a credential name', `.git-cr${CYR_E}dentials`, 'credentials-file'],
    ['a look-alike dash in a credential name', '.git‐credentials', 'credentials-file'],
    ['fullwidth directory', `${fullwidth('secrets')}/api.txt`, 'secrets-dir'],
    ['fullwidth upper case', `${fullwidth('SECRETS')}/api.txt`, 'secrets-dir'],
    ['fullwidth dot', `${fullwidth('.')}env`, 'dot-env'],
    ['long s', 'ſecrets/api.txt', 'secrets-dir'],
    ['a look-alike inside a longer segment', `my${CYR_S}ecrets-backup/db.txt`, 'secrets-dir'],
    ['a zero-width space', 'sec​rets/api.txt', 'secrets-dir'],
    ['dotted capital I', '.GİT/config', 'dot-git'],
    ['Cyrillic key extension', `server.k${CYR_E}y`, 'private-key']
  ])('%s', (_label, path, rule) => {
    expect(ruleFor(path)).toBe(rule);
  });

  it('create removes them, and names the real spelling and the right rule', () => {
    const secret = `s${CYR_E}crets/api.txt`;
    const env = `.${CYR_E}nv`;
    const wide = `${fullwidth('secrets')}/db.txt`;
    const { shipped, plan } = ship({ [secret]: 'fake\n', [env]: 'fake\n', [wide]: 'fake\n', 'notes.txt': 'keep\n' });
    expect(shipped.sort()).toEqual(['TASK.md', 'notes.txt', 'src/app.py']);
    const removals = plan.ruleRemovals.flatMap(entry => entry.paths.map(path => [path, entry.rule]));
    expect(removals).toEqual(expect.arrayContaining([[secret, 'secrets-dir'], [env, 'dot-env'], [wide, 'secrets-dir']]));
  });

  it('a look-alike task file is refused by name', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    write(repo, `.${CYR_E}nv`, 'fake\n');
    try {
      planBounty({ repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, `.${CYR_E}nv`) });
      expect.unreachable('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(BountyRefused);
      expect((error as BountyRefused).reason).toBe('never-ship-input');
      expect((error as BountyRefused).message).toContain('dot-env');
    }
  });
});

describe('the journey back: what a commit carries', () => {
  it('a look-alike path in a real commit is a violation under the plain rule, with its real spelling', () => {
    const path = `s${CYR_E}crets/planted.txt`;
    const repo = makeRepo({ 'src/app.py': 'x\n', [path]: 'fake\n' });
    const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim();
    const statuses = commitStatuses(repo, sha, 'nothing was collected', EMPTY_TREE);
    expect(neverShipViolations(statuses, shipRules(repo))).toEqual([{ path, rule: 'secrets-dir' }]);
  });
});

describe('the owner lists are matched the same way', () => {
  it('an NFD path is caught by an NFC .boxignore entry, and the other way round', () => {
    const one = ship({ '.boxignore': `${NFC_CAFE}/\n`, [`${NFD_CAFE}/menu.txt`]: 'fake\n' });
    expect(one.plan.ruleRemovals).toEqual([{ rule: 'owner-list', removed: 1, paths: [`${NFD_CAFE}/menu.txt`] }]);
    const two = ship({ '.boxignore': `${NFD_CAFE}/\n`, [`${NFC_CAFE}/menu.txt`]: 'fake\n' });
    expect(two.plan.ruleRemovals).toEqual([{ rule: 'owner-list', removed: 1, paths: [`${NFC_CAFE}/menu.txt`] }]);
  });

  it('a look-alike of a .boxignore entry is caught', () => {
    const { plan } = ship({ '.boxignore': 'private/\n', [`prіvat${CYR_E}/algo.py`]: 'fake\n' });
    expect(plan.ruleRemovals).toEqual([{ rule: 'owner-list', removed: 1, paths: [`prіvat${CYR_E}/algo.py`] }]);
  });

  it('a look-alike of a never-publish entry is caught', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    changePublishList(repo, 'never-publish', 'add', 'private');
    const rule = shipRules(repo).find(entry => entry.match(`prіvat${CYR_E}/algo.py`.toLowerCase()));
    expect(rule?.name).toBe('owner-never-publish');
  });

  it('a look-alike never-ship path cannot go on the safe list', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    expect(() => changePublishList(repo, 'safe-to-publish', 'add', `.${CYR_E}nv`)).toThrow(/dot-env/);
  });

  it('the safe list is not folded: a look-alike of a safe entry gets no exception', () => {
    expect(publishListed(['fixtures/keys.txt'], `fixtures/k${CYR_E}ys.txt`)).toBe(false);
    expect(publishListed(['fixtures/keys.txt'], 'FIXTURES/Keys.txt')).toBe(true);
  });
});

describe('no rule is widened', () => {
  it.each([
    ['docs/secret-sauce.md'],
    ['secretary/minutes.txt'],
    [`docs/s${CYR_E}cret-sauce.md`],
    ['docs/environment.md'],
    ['документы/отчёт.txt']
  ])('%s stays allowed', path => {
    expect(ruleFor(path)).toBeUndefined();
  });

  it.each([['secrets-guide.md', 'secrets-dir'], ['.env', 'dot-env'], ['.env.example', 'dot-env']])('%s stays refused', (path, rule) => {
    expect(ruleFor(path)).toBe(rule);
  });

  it('create prints the path as found: the shipped list keeps the real spelling of an allowed path', () => {
    const allowed = `docs/s${CYR_E}cret-sauce.md`;
    expect(ship({ [allowed]: 'keep\n' }).shipped).toContain(allowed);
  });
});

// One plain spelling per rule word, with the rule it must name.
const RULE_WORDS: readonly (readonly [string, string])[] = [
  ['.git/config', 'dot-git'],
  ['.env', 'dot-env'], ['.envrc', 'dot-env'], ['prod.env', 'dot-env'],
  ['secrets/a.txt', 'secrets-dir'], ['mysecrets/a.txt', 'secrets-dir'],
  ['.runtime/a.txt', 'runtime-dir'],
  ['.box/a.txt', 'dot-box'],
  ...['key', 'pem', 'p12', 'pfx', 'jks', 'keystore', 'ppk', 'gpg'].map(ext => [`a.${ext}`, 'private-key'] as const),
  ...['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519'].map(name => [name, 'private-key'] as const),
  ...['crt', 'cer', 'der', 'cert', 'p7b', 'p7c', 'asc'].map(ext => [`a.${ext}`, 'certificate'] as const),
  ...['.netrc', '.pgpass', '.htpasswd', '.git-credentials', '.npmrc', '.pypirc', '.dockercfg', '.yarnrc', '.yarnrc.yml', '.aws/credentials', '.docker/config.json'].map(name => [name, 'credentials-file'] as const)
];

const ALIKE = new Map(Object.entries(CONFUSABLES).map(([ascii, alikes]) => [ascii, [...alikes]]));

// Every table look-alike at every position, all positions at once, full width,
// upper case over each of those, and an invisible character at every gap.
function variantsOf(plain: string): { readonly respelled: string[]; readonly caseOnly: string[] } {
  const chars = [...plain];
  const respelled = new Set<string>();
  chars.forEach((ch, at) => {
    for (const alike of ALIKE.get(ch) ?? []) respelled.add([...chars.slice(0, at), alike, ...chars.slice(at + 1)].join(''));
    if (at > 0) respelled.add(`${chars.slice(0, at).join('')}​${chars.slice(at).join('')}`);
  });
  for (let pick = 0; pick < 3; pick += 1) respelled.add(chars.map(ch => ALIKE.get(ch)?.[pick] ?? ch).join(''));
  respelled.add(fullwidth(plain));
  for (const variant of [...respelled]) respelled.add(variant.toUpperCase());
  return { respelled: [...respelled].filter(variant => variant.toLowerCase() !== plain), caseOnly: [plain.toUpperCase()] };
}

describe('every rule word holds across its variants', () => {
  it.each(RULE_WORDS)('%s', (plain, rule) => {
    const { respelled, caseOnly } = variantsOf(plain);
    expect(respelled.length).toBeGreaterThan(0);
    for (const variant of [plain, ...caseOnly, ...respelled]) expect([variant, ruleFor(variant)]).toEqual([variant, rule]);
    // The same run: a plain allowed path stays allowed.
    for (const allowed of ['docs/secret-sauce.md', 'secretary/minutes.txt']) expect(ruleFor(allowed)).toBeUndefined();
  });

  // The guard bites: without the fold, lower-casing alone misses the respellings,
  // so the fold is what the test above is proving.
  it.each(RULE_WORDS)('without the fold the respellings of %s pass', (plain, rule) => {
    const unfolded = UNFOLDED_RULES.find(entry => entry.name === rule)!;
    expect(unfolded.match(plain)).toBe(true);
    const missed = variantsOf(plain).respelled.filter(variant => !unfolded.match(variant.toLowerCase()));
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.every(variant => BUILTIN_RULES.some(entry => entry.match(variant)))).toBe(true);
  });

  it('the table holds only what can arrive: each entry is unchanged by NFKC and lower-casing, and folds to ASCII', () => {
    for (const [ascii, alikes] of Object.entries(CONFUSABLES)) {
      expect(ascii).toMatch(/^[\x00-\x7f]$/);
      for (const alike of alikes) {
        expect(alike.normalize('NFKC').toLowerCase()).toBe(alike);
        expect(matchingSkeleton(alike)).toBe(ascii);
      }
    }
  });

  it('the skeleton is stable: folding twice changes nothing', () => {
    for (const [plain] of RULE_WORDS) for (const variant of variantsOf(plain).respelled) expect(matchingSkeleton(matchingSkeleton(variant))).toBe(matchingSkeleton(variant));
  });
});
