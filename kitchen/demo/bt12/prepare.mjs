#!/usr/bin/env node
// BT12 demo rig — prepares the demo world the head chef's driver enters.
// Everything lands under --run (a wave-named evidence folder); nothing is
// staged inside the tool checkout and no command is prepared for the driver.
//
//   node kitchen/demo/bt12/prepare.mjs --run <folder>
//       [--source https://github.com/shouteck/box-bounty-sandbox]
//       [--artifact <path to box-bounty-<v>.tgz>]
//
// What it does, in order — each step is checked, never assumed:
//   1. `git clone` the sandbox repository into <run>/project — a fresh
//      clone in a clean folder outside this checkout;
//   2. `npm i -g --prefix <run>/prefix <artifact>` — the one install command
//      a stranger runs; the prefix is the only place `box` lives;
//   3. an env file for pty_host describing the clean environment — PATH is
//      the demo prefix, then only the directories of the machine's own
//      node/git/gh; the host's settings never leak in;
//   4. a copy of the first-five-minutes page at <run>/page.md — the only
//      document the driver is given.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const OUT = resolve(flag('--run'));
const SOURCE = flag('--source', 'https://github.com/shouteck/box-bounty-sandbox');
const refuse = (why) => { console.log(`prepare refused: ${why}`); process.exit(2); };
if (existsSync(OUT) && readdirSync(OUT).length > 0) refuse(`the output folder ${OUT} already exists and is not this command's`);
mkdirSync(OUT, { recursive: true });
const defaultArtifact = join(REPO, 'packages', 'box-cli', 'dist-package');
const ARTIFACT = args.includes('--artifact')
  ? resolve(flag('--artifact'))
  : (() => {
      if (!existsSync(defaultArtifact)) refuse('no packed artifact found — run node packages/box-cli/pack.mjs first or pass --artifact');
      const tgz = readdirSync(defaultArtifact).filter(f => f.endsWith('.tgz'));
      if (tgz.length !== 1) refuse(`expected exactly one tarball in ${defaultArtifact}, found ${tgz.length}`);
      return join(defaultArtifact, tgz[0]);
    })();
if (!existsSync(ARTIFACT)) refuse(`artifact missing: ${ARTIFACT}`);

const run = (program, argv, opts = {}) => {
  const cmd = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', program, ...argv], { encoding: 'utf8', windowsHide: true, ...opts })
    : spawnSync(program, argv, { encoding: 'utf8', ...opts });
  if (cmd.status !== 0 || cmd.error !== undefined) {
    refuse(`${program} ${argv.join(' ')} failed (${cmd.status ?? cmd.error}): ${(cmd.stdout ?? '') + (cmd.stderr ?? '')}`);
  }
  return cmd.stdout;
};

const project = join(OUT, 'project');
run('git', ['clone', '--quiet', SOURCE, project]);
const remotes = run('git', ['-C', project, 'remote']).trim().split('\n');
if (!remotes.includes('origin')) refuse('the clean clone has no origin remote');

const prefix = join(OUT, 'prefix');
run('npm', ['i', '-g', '--prefix', prefix, ARTIFACT]);
const box = join(prefix, process.platform === 'win32' ? 'box.cmd' : join('bin', 'box'));
if (!existsSync(box)) refuse(`the install did not expose box at ${box}`);
const help = run(box, ['bounty', 'help'], { cwd: project });
if (!help.includes('the journey')) refuse('the installed box did not answer bounty help');

// The clean environment: PATH resolves box first, then the directories of
// the machine's own node, git and gh — the only tools the demo needs; every
// other PATH entry is dropped so nothing of this checkout can be reached.
const dirs = (program) => {
  const where = process.platform === 'win32'
    ? spawnSync('where', [program], { encoding: 'utf8' })
    : spawnSync('which', [program], { encoding: 'utf8' });
  return [...new Set(where.stdout.trim().split('\n').filter(Boolean).map(p => dirname(p.trim())))];
};
const pathEntries = [
  process.platform === 'win32' ? prefix : join(prefix, 'bin'),
  dirname(process.execPath),
  ...dirs('git'),
  ...dirs('gh'),
  ...(process.platform === 'win32' ? [process.env.SystemRoot, join(process.env.SystemRoot, 'System32')] : ['/usr/bin', '/bin']),
].filter(Boolean);
const settings = join(OUT, 'settings');
mkdirSync(settings, { recursive: true });
const envSpec = {
  keep: [],
  set: {
    PATH: pathEntries.join(process.platform === 'win32' ? ';' : ':'),
    BOX_BOUNTY_SETTINGS_DIR: settings,
    ...(process.platform === 'win32' ? {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR ?? process.env.SystemRoot,
      COMSPEC: process.env.ComSpec ?? 'C:\Windows\System32\cmd.exe',
      APPDATA: process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
      USERPROFILE: homedir(),
      TEMP: join(homedir(), 'AppData', 'Local', 'Temp'),
      TMP: join(homedir(), 'AppData', 'Local', 'Temp'),
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
    } : { HOME: homedir(), LANG: 'C.UTF-8' }),
  },
};
writeFileSync(join(OUT, 'env.json'), JSON.stringify(envSpec, null, 2) + '\n');
copyFileSync(join(REPO, 'FIRST-FIVE-MINUTES.md'), join(OUT, 'page.md'));
console.log(JSON.stringify({
  project,
  prefix,
  box,
  envFile: join(OUT, 'env.json'),
  page: join(OUT, 'page.md'),
  note: 'record-session.mjs --cwd <project> --env-file <env.json> --run <evidence> ; driver uses terminal.mjs --run <evidence> read|type only',
}, null, 2));
