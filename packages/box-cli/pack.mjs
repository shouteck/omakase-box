#!/usr/bin/env node
// Build the published artifact (BT12): one bundled file carrying the bounty
// tool and nothing else — no export/submit/verify/trace, no dependencies to
// resolve at install — plus the licence files, the first-five-minutes page
// as README, and a manifest with no install-time scripts. Then `npm pack`
// it into <out>/omakase-box-<version>.tgz — the exact bytes `npm publish`
// would send, never published by this script.
//
//   node packages/box-cli/pack.mjs [--out <dir>]
//
// The staging and the tarball land under packages/box-cli/dist-package/ by
// default (gitignored, rebuilt every run).
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const OUT = outIndex >= 0 ? resolve(process.cwd(), args[outIndex + 1]) : join(HERE, 'dist-package');
const PKG = join(OUT, 'package');

// The manifest's fields are fixed here — the name is provisional pending
// the owner's Part-B decision; wording.ts's INSTALL_PACKAGE says the same
// name and the packaging test pins them equal.
const NODE_MINIMUM = /NODE_MINIMUM = '([^']+)'/.exec(readFileSync(join(HERE, 'src', 'node-check.ts'), 'utf8'))?.[1];
if (NODE_MINIMUM === undefined) { console.error('pack: could not read NODE_MINIMUM from src/node-check.ts'); process.exit(1); }
const MANIFEST = {
  name: 'omakase-box',
  version: '0.2.1', // 0.2.0 (BT53) is on npm; 0.2.1 (BT65): `setup --help` writes nothing, a typo of `--remove` is refused
  description: 'omakase-box — an agent hands a task it cannot or should not do to outside solvers: the task and what it tried become a bounty, a GitHub issue on the repository, and solutions return as facts the agent judges; nothing a solver wrote is ever run. It also takes work: an agent lists other projects\' bounties, takes one in a throwaway copy, submits a pull request, and is paid when the owner\'s merge lands.',
  type: 'module',
  bin: { 'omakase-box': 'dist/box.js' }, // never `box`: Box owns it, and npm then refuses to install beside @box/cli (BT63)
  files: ['dist/box.js', 'LICENSE', 'NOTICE', 'README.md'],
  engines: { node: `>=${NODE_MINIMUM}` },
  license: 'Apache-2.0',
  repository: { type: 'git', url: 'https://github.com/shouteck/omakase-box.git' },
  keywords: ['bounty', 'github', 'agent', 'delegation', 'bounties', 'coding-agent', 'agent-skills', 'mcp', 'paid-work', 'open-source']
};

rmSync(PKG, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
mkdirSync(PKG, { recursive: true });
// One file: the entry's whole import graph is static, so the build emits a
// single dist/box.js — no chunks, no externals beyond node: builtins.
// Target es2020 keeps the bundle parseable well below the runtime floor
// (Node 22), so a too-old Node reaches the named refusal instead of a
// syntax error.
await build({
  root: HERE,
  build: { ssr: 'src/box.ts', outDir: join(PKG, 'dist'), emptyOutDir: true, sourcemap: false, target: 'es2020' },
  logLevel: 'warn'
});
writeFileSync(join(PKG, 'package.json'), `${JSON.stringify(MANIFEST, null, 2)}\n`);
copyFileSync(join(ROOT, 'LICENSE'), join(PKG, 'LICENSE'));
copyFileSync(join(HERE, 'NOTICE'), join(PKG, 'NOTICE'));
copyFileSync(join(ROOT, 'FIRST-FIVE-MINUTES.md'), join(PKG, 'README.md'));

// `npm` is a .cmd on Windows — spawn it through cmd there, not bare.
const run = (program, argv) => process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', program, ...argv], { cwd: PKG, encoding: 'utf8', windowsHide: true })
  : spawnSync(program, argv, { cwd: PKG, encoding: 'utf8' });
const pack = run('npm', ['pack', '--pack-destination', OUT]);
if (pack.status !== 0) { console.error(`npm pack failed:\n${pack.stdout}${pack.stderr}`); process.exit(1); }
const tarball = join(OUT, `omakase-box-${MANIFEST.version}.tgz`);
// The artifact's contents are the staging folder's — the manifest's `files`
// list is the allow-list, and npm adds only package.json/README/LICENSE,
// which are all already staged.
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else files.push(`package/${path.slice(PKG.length + 1).replaceAll('\\', '/')}`);
  }
};
walk(PKG);
files.sort();
console.log(JSON.stringify({ tarball, files, bytes: statSync(tarball).size }, null, 2));
