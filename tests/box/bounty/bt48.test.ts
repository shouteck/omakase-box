import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILTIN_RULES, BountyRefused, changePublishList, finalizeBounty, planBounty, publishListed, shipRules } from '../../../packages/box-bounty/index.js';
import { makeRepo, runRoot, write } from './support.js';

// BT48: a path is judged by what it looks like. Look-alike spellings are refused
// under the rule the plain spelling names, and the path shown is the real one.
// Non-ASCII letters are written as escapes so the file shows which is which.

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
    ['Cyrillic dze in a credential name', `.git-cr${CYR_E}dentials`, 'credentials-file'],
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

void runRoot;
