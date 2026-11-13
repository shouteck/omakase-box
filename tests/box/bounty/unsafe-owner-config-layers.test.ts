// K69 (from K68's pattern C): "could the owner's Git configuration run a program a solution supplies or changes during apply" as data.
// `apply` refuses (apply-unsafe-config, exit 3, nothing touched) when unsafeOwnerCommands(repo) finds anything; that function reads the
// owner's Git configuration and what exists on disk, and nothing about the solution. The four bt6b files built a whole solver world
// (create, post, a solver's pull request, look, apply through the built tool) to read that one verdict, once per command string, about
// 8 s each. Here each command string is a row: its configuration and files are set on one shared repository, the verdict is read, and the
// row is reset. The wiring (apply refuses with exit 3 and moves nothing) stays in bt6b.test.ts as one real apply, and the real landings
// ("the owner's program really runs") stay as journeys; each of those has its safe row here too.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { unsafeOwnerCommands } from '../../../packages/box-bounty/git.js';
import { filteredRepo, filteredRepoUnder, inTreeFilter } from './bt6b-shared.js';
import { git, runRoot, write } from './support.js';

const posix = (path: string): string => path.replaceAll('\\', '/');
interface Row {
  readonly name: string;
  readonly files?: Readonly<Record<string, string>>; // written into the repository for the row (not committed: the check reads what exists)
  readonly config: readonly (readonly [string, string])[];
  /** the verdict: absent means nothing is unsafe; otherwise an entry for `key` that mentions each of `mentions` */
  readonly refuses?: { readonly key: string; readonly mentions: readonly string[] };
}

const repo = filteredRepo();
const outside = runRoot('k69-unsafe-outside');
const external = join(outside, 'crypt.cjs');
writeFileSync(external, 'process.stdout.write(require("node:fs").readFileSync(0));\n');
mkdirSync(join(outside, 'npm'), { recursive: true });
writeFileSync(join(outside, 'npm', 'package.json'), JSON.stringify({ scripts: { go: 'node -e 1' } }));
writeFileSync(join(outside, 'f.txt'), 'outside\n');
mkdirSync(join(outside, 'inc'), { recursive: true });
writeFileSync(join(outside, 'inc', 'outside.conf'), '[include]\n\tpath = ./sibling.conf\n');
writeFileSync(join(outside, 'inc', 'sibling.conf'), '[filter "benign"]\n\tclean = cat\n');

const PWN = { 'tools/pwn.cjs': '// owner placeholder\n' };
const ALIAS_PWN: readonly [string, string] = ['alias.pwn', '!node tools/pwn.cjs'];
const smudge = (value: string): readonly [string, string] => ['filter.own.smudge', value];

function verdictOf(row: Row, at: string = repo) {
  const written = Object.keys(row.files ?? {});
  for (const [path, text] of Object.entries(row.files ?? {})) write(at, path, text);
  for (const [key, value] of row.config) git(at, ['config', key, value]);
  try { return unsafeOwnerCommands(at); } finally {
    for (const [key] of row.config) { try { git(at, ['config', '--unset-all', key]); } catch { /* not set */ } }
    for (const path of written) rmSync(join(at, path), { force: true });
  }
}
const expectRow = (row: Row, found: ReturnType<typeof unsafeOwnerCommands>): void => {
  if (row.refuses === undefined) { expect(found, `${row.name} is safe`).toEqual([]); return; }
  const entry = found.filter(item => item.key === row.refuses!.key);
  expect(entry.length, `${row.name}: no refusal for ${row.refuses.key} in ${JSON.stringify(found)}`).toBeGreaterThan(0);
  for (const mention of row.refuses.mentions) expect(JSON.stringify(entry), `${row.name} names ${mention}`).toContain(mention);
};

const REFUSED: readonly Row[] = [
  { name: 'a filter program inside the repository', config: [['filter.own.clean', 'node tools/filter.cjs clean'], ['filter.own.smudge', 'node tools/filter.cjs smudge'], ['filter.own.required', 'true']], refuses: { key: 'filter.own.clean', mentions: ['tools/filter.cjs'] } },
  { name: 'an in-tree program that is unchanged but reads a file the solution changes (any in-tree program refuses)', files: { 'tools/key.txt': 'owner key\n' }, config: [['filter.own.clean', 'node tools/filter.cjs clean'], ['filter.own.smudge', 'node tools/filter.cjs smudge']], refuses: { key: 'filter.own.clean', mentions: ['tools/filter.cjs'] } },
  { name: 'a merge driver whose program is inside the repository', files: { 'tools/drv.cjs': '// merge driver\n' }, config: [['merge.own.driver', 'node tools/drv.cjs %O %A %B %L']], refuses: { key: 'merge.own.driver', mentions: ['tools/drv.cjs'] } },
  { name: 'a configured command the tool cannot place inside or outside the tree', config: [['filter.mystery.clean', 'bt6b-no-such-program %f']], refuses: { key: 'filter.mystery.clean', mentions: [] } },
  { name: 'hole A: a git reached after a pipe', files: PWN, config: [smudge('cat | git pwn'), ALIAS_PWN], refuses: { key: 'filter.own.smudge', mentions: ['tools/pwn.cjs'] } },
  { name: "hole A: a git that arms its own alias with -c (no alias in config at all)", config: [smudge("cat | git -c 'alias.x=!node x' x")], refuses: { key: 'filter.own.smudge', mentions: [] } },
  { name: 'hole A: the same split inside a !-alias expansion', files: PWN, config: [smudge('git pwn'), ['alias.pwn', '!cat ; git q'], ['alias.q', '!node tools/pwn.cjs']], refuses: { key: 'filter.own.smudge', mentions: ['tools/pwn.cjs'] } },
  { name: 'hole A: a merge driver that pipes through git', files: { ...PWN, 'file.drv': 'base\n' }, config: [['merge.drv.driver', 'echo x | git pwn'], ALIAS_PWN], refuses: { key: 'merge.drv.driver', mentions: [] } },
  { name: 'hole B: a launcher whose program lives in a package.json the solution supplies', config: [smudge('npm run bt6bpwn')], refuses: { key: 'filter.own.smudge', mentions: ['package.json'] } },
  { name: 'hole C: find -exec carrying a git operand', files: PWN, config: [smudge('find . -exec git pwn {} +'), ALIAS_PWN], refuses: { key: 'filter.own.smudge', mentions: [] } },
  { name: 'hole C: find -execdir carrying a git operand', files: PWN, config: [smudge('find . -execdir git pwn {} +'), ALIAS_PWN], refuses: { key: 'filter.own.smudge', mentions: [] } },
  { name: 'hole C: the git operand even when every other word places outside', files: PWN, config: [smudge(`find "${posix(outside)}" -exec git pwn {} +`), ALIAS_PWN], refuses: { key: 'filter.own.smudge', mentions: ['tools/pwn.cjs'] } },
  { name: 'hole C: ssh wrapping a command', config: [smudge('ssh localhost git pwn'), ALIAS_PWN], refuses: { key: 'filter.own.smudge', mentions: [] } },
  { name: 'hole C: wsl wrapping a command', config: [smudge('wsl git pwn'), ALIAS_PWN], refuses: { key: 'filter.own.smudge', mentions: [] } },
  { name: 'hole C: stdbuf wrapping a command', config: [smudge('stdbuf git pwn'), ALIAS_PWN], refuses: { key: 'filter.own.smudge', mentions: [] } },
  { name: 'hole D: tar --use-compress-program', files: PWN, config: [smudge(`tar -cf "${posix(join(outside, 'x.tar'))}" --use-compress-program='git pwn' zz.dat`), ALIAS_PWN], refuses: { key: 'filter.own.smudge', mentions: ['tools/pwn.cjs'] } },
  { name: 'hole D: sort --compress-program', files: PWN, config: [smudge("sort --compress-program='git pwn' zz.dat"), ALIAS_PWN], refuses: { key: 'filter.own.smudge', mentions: ['tools/pwn.cjs'] } },
  { name: 'hole D: tar -I', files: PWN, config: [smudge("tar -I 'git pwn' -cf x.tar zz.dat"), ALIAS_PWN], refuses: { key: 'filter.own.smudge', mentions: ['tools/pwn.cjs'] } },
  { name: "hole E: npm run <script> -f <dir> (-f is --force, not a file)", config: [smudge(`npm run bt6bpwn -f "${posix(join(outside, 'npm'))}"`)], refuses: { key: 'filter.own.smudge', mentions: ['package.json'] } },
  { name: 'hole E: npm -f <dir> run <script>', config: [smudge(`npm -f "${posix(join(outside, 'npm'))}" run bt6bpwn`)], refuses: { key: 'filter.own.smudge', mentions: ['package.json'] } },
  { name: 'hole 1: a bare interpreter filter (the filtered stream is the program)', config: [smudge('node')], refuses: { key: 'filter.own.smudge', mentions: ['node'] } },
  { name: 'hole 2: a git filter command whose alias lands inside the tree', files: PWN, config: [smudge('git pwn'), ALIAS_PWN], refuses: { key: 'filter.own.smudge', mentions: ['tools/pwn.cjs'] } },
  { name: 'an environment reference cannot be placed', config: [smudge('$HOME/bin/filter')], refuses: { key: 'filter.own.smudge', mentions: ['cannot be placed'] } },
  { name: 'a Windows environment variable cannot be placed', config: [smudge('%TOOLS% clean')], refuses: { key: 'filter.own.smudge', mentions: ['cannot be placed'] } },
  // K69: rows that only one rule can explain (the alias behind each is safe, so nothing but the wrapper rule refuses them)
  { name: 'a host wrapper refuses outright even when the command behind it is safe: ssh', config: [smudge('ssh localhost git pwn'), ['alias.pwn', `!node "${posix(external)}"`]], refuses: { key: 'filter.own.smudge', mentions: [] } },
  { name: 'a host wrapper refuses outright even when the command behind it is safe: wsl', config: [smudge('wsl git pwn'), ['alias.pwn', `!node "${posix(external)}"`]], refuses: { key: 'filter.own.smudge', mentions: [] } },
  { name: 'hole 3: an include.path that escapes .git/config into the tree', files: { 'armed.conf': '[filter "arm"]\n\tclean = node tools/pwn.cjs\n' }, config: [['include.path', '../armed.conf']], refuses: { key: 'include.path', mentions: ['armed.conf'] } }
];

const SAFE: readonly Row[] = [
  { name: 'an inline git -c alias that runs a program outside the tree', config: [smudge(`git -c 'alias.x=!node "${posix(external)}"' x`)] },
  { name: 'filter programs outside the repository', config: [['filter.own.clean', `"${posix(process.execPath)}" "${posix(external)}" clean`], ['filter.own.smudge', `"${posix(process.execPath)}" "${posix(external)}" smudge`], ['filter.own.required', 'true']] },
  { name: 'hole A: every command in a piped line places outside the tree', config: [smudge('cat | git pwn'), ['alias.pwn', `!node "${posix(external)}"`]] },
  { name: 'hole B: a launcher naming a manifest outside the tree (--prefix)', config: [smudge(`npm --prefix "${posix(join(outside, 'npm'))}" --silent run go`)] },
  { name: 'a double-quoted word holding a separator is data, not two commands', config: [smudge('echo "a;b"')] },
  { name: 'an exec operand that names only outside programs', config: [smudge(`find "${posix(outside)}" -exec cat {} +`)] },
  { name: 'hole 2: a git alias that expands to programs placed outside the tree', config: [smudge('git pwn'), ['alias.pwn', `!node "${posix(external)}"`]] },
  { name: 'hole 3: every include in the chain resolves outside the tree', config: [['include.path', posix(join(outside, 'inc', 'outside.conf'))]] }
];

describe('K69: could the owner\'s Git configuration run a program a solution supplies or changes?', () => {
  // @guards R1
  it.each(REFUSED.map(row => [row.name, row] as const))('refuses: %s', (_name, row) => {
    expectRow(row, verdictOf(row));
  });

  // @guards R1
  it.each(SAFE.map(row => [row.name, row] as const))('lets through: %s', (_name, row) => {
    expectRow(row, verdictOf(row));
  });

  // The two spellings that depend on where the repository lives get their own repository.
  describe('includes that depend on the repository\'s place', () => {
    const homes: string[] = [];
    afterAll(() => { for (const home of homes) rmSync(home, { recursive: true, force: true, maxRetries: 40, retryDelay: 500 }); });

    // @guards R1
    it('refuses: hole 3: a ~/-spelled include that lands inside the tree (the repository is placed under the home directory)', () => {
      const home = mkdtempSync(join(homedir(), 'box-bt15-ci-home-include-'));
      homes.push(home);
      const under = filteredRepoUnder(home);
      const fromHome = relative(homedir(), under).split(sep).join('/');
      expect(fromHome.startsWith('..')).toBe(false);
      expectRow({ name: 'a ~/ include', files: { 'armed.conf': '[filter "arm"]\n\tclean = node tools/pwn.cjs\n' }, config: [['include.path', `~/${fromHome}/armed.conf`]], refuses: { key: 'include.path', mentions: [] } }, verdictOf({ name: 'a ~/ include', files: { 'armed.conf': '[filter "arm"]\n\tclean = node tools/pwn.cjs\n' }, config: [['include.path', `~/${fromHome}/armed.conf`]] }, under));
    });

    // @guards R1
    it('refuses: hole 3: a nested include, where a relative path inside an outside file lands in the tree', () => {
      const dir = runRoot('k69-nested-include');
      const nested = join(dir, 'outside.conf');
      mkdirSync(dirname(nested), { recursive: true });
      writeFileSync(nested, `[include]\n\tpath = ${posix(relative(dir, join(repo, 'armed.conf')))}\n`);
      const row: Row = { name: 'a nested include', files: { 'armed.conf': '[filter "arm"]\n\tclean = node tools/pwn.cjs\n' }, config: [['include.path', posix(nested)]], refuses: { key: 'include.path', mentions: ['armed.conf'] } };
      expectRow(row, verdictOf(row));
    });
  });
});
