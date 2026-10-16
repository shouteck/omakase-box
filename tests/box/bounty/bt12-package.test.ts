// BT12 — the published artifact: one tarball, an explicit allow-list of
// contents, nothing that reaches outside it. The pack step runs once per
// file (beforeAll) into an owned temp root; every check below reads the
// built bytes, never the sources, so a file that slipped in or a string
// that changed shows up here, not on a stranger's machine.
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INSTALL_PACKAGE, renderRulesBlock, rulesBlockInterior, scanText } from '../../../packages/box-bounty/index.js';
import { NODE_MINIMUM } from '../../../packages/box-cli/src/node-check.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'box-bt12-pack-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); });

// A tiny ustar reader — parsing the tarball in-process keeps this test off
// any platform `tar`, which spells the same path differently per flavour.
function untar(tgz: Buffer): Map<string, Buffer> {
  const raw = gunzipSync(tgz);
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 512 <= raw.length) {
    const header = raw.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0[\s\S]*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0[\s\S]*$/, '');
    const size = Number.parseInt(header.subarray(124, 136).toString('utf8').trim() || '0', 8);
    const kind = String.fromCharCode(header[156] ?? 0);
    const full = prefix === '' ? name : `${prefix}/${name}`;
    if (!['5', 'x', 'g', 'L', 'K'].includes(kind)) files.set(full, Buffer.from(raw.subarray(offset + 512, offset + 512 + size)));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

const ALLOW = ['package/LICENSE', 'package/NOTICE', 'package/README.md', 'package/dist/box.js', 'package/package.json'];

let out = '';
let tarball = '';
let files = new Map<string, Buffer>();
beforeAll(() => {
  out = temp();
  const pack = spawnSync(process.execPath, [join(ROOT, 'packages/box-cli/pack.mjs'), '--out', out], { encoding: 'utf8', timeout: 240000 });
  expect(pack.status, `${pack.stdout}\n${pack.stderr}`).toBe(0);
  const summary = JSON.parse(pack.stdout.slice(pack.stdout.indexOf('{'))) as { tarball: string };
  tarball = summary.tarball;
  files = untar(readFileSync(tarball));
}, 300000);

const bundle = () => files.get('package/dist/box.js')!.toString('utf8');
const manifest = () => JSON.parse(files.get('package/package.json')!.toString('utf8')) as Record<string, unknown>;

describe('the artifact is the bounty tool and nothing else', () => {
  it('carries exactly the allow-listed files', () => {
    expect([...files.keys()].sort()).toEqual(ALLOW);
  });
  it('has no dependency to resolve and no install-time script', () => {
    const pkg = manifest();
    expect(pkg['dependencies'] ?? {}).toEqual({});
    for (const key of ['scripts', 'preinstall', 'install', 'postinstall', 'prepare', 'binding.gyp']) {
      expect(pkg[key], key).toBeUndefined();
    }
    expect(pkg['private']).toBeUndefined();
    expect(pkg['license']).toBe('Apache-2.0');
    expect((pkg['bin'] as Record<string, string>)['box']).toBe('dist/box.js');
  });
  it('is one file that imports node builtins only', () => {
    const specifiers = [...bundle().matchAll(/from "([^"]+)"/g)].map(match => match[1]);
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) expect(specifier).toMatch(/^node:/);
    expect(bundle()).not.toMatch(/import\(/);       // no lazy chunks to fetch
    expect(bundle()).not.toMatch(/\brequire\(/);    // nothing CommonJS left
  });
  it('carries the licence files and the first-five-minutes page as README', () => {
    expect(files.get('package/LICENSE')!.toString('utf8')).toBe(readFileSync(join(ROOT, 'LICENSE'), 'utf8'));
    expect(files.get('package/README.md')!.toString('utf8')).toBe(readFileSync(join(ROOT, 'FIRST-FIVE-MINUTES.md'), 'utf8'));
    expect(files.get('package/NOTICE')!.toString('utf8')).toContain('Copyright 2026 shouteck');
  });
});

describe('the artifact carries no secrets and no machine paths', () => {
  it('passes the bounty content scan on every file', () => {
    for (const [name, body] of files) {
      const text = body.toString('latin1');
      expect(scanText(name, text).length, name).toBe(0);
    }
  });
  it('names no path or user of this machine', () => {
    const username = userInfo().username;
    for (const [name, body] of files) {
      const text = body.toString('utf8');
      expect(text, name).not.toContain(ROOT);
      // The user folder itself, not the username — 'shouteck' inside a
      // licence line is the owner's mark, not a machine path.
      if (username.length >= 3) expect(text, name).not.toMatch(new RegExp(`[\\\\/]${username}([\\\\/\\s]|$)`));
      expect(text, name).not.toMatch(/[A-Za-z]:[\\/]Users/i);
    }
  });
  it('names no command spelling but `box bounty …`', () => {
    // The old spelling was an interpreter plus a repository path.
    for (const [name, body] of files) {
      const text = body.toString('utf8');
      expect(text, name).not.toMatch(/node\s+packages[\/]box-cli/);
      expect(text, name).not.toContain('dist/cli.js');
    }
    // And the messages a user can actually print say `box …` only.
    for (const argv of [['bounty', 'help'], ['bounty', 'describe'], ['bounty', 'create', '--help'], ['--help']]) {
      const run = spawnSync(process.execPath, [join(out, 'package', 'dist', 'box.js'), ...argv], { encoding: 'utf8' });
      expect(run.status, argv.join(' ')).toBe(0);
      expect(run.stdout + run.stderr, argv.join(' ')).not.toMatch(/cli\.js|packages[\/]|node\b.*bounty/);
    }
  });
});

describe('what it needs is stated and checked', () => {
  it('pins the manifest name, and the notice names no unpublished package', () => {
    expect(manifest()['name']).toBe(INSTALL_PACKAGE);
    // Held until the owner publishes the name (Part B): an unpublished name
    // in an instruction an agent executes can be claimed by anyone first.
    for (const state of ['idle', 'open', 'new'] as const) {
      // The markers are `<!-- box-bounty -->`; the interior is what an agent reads.
      expect(renderRulesBlock(state), state).not.toContain('npx');
      expect(rulesBlockInterior(state).join('\n'), state).not.toContain(INSTALL_PACKAGE);
    }
  });
  it('declares Node 22 as the floor, and no scanned feature needs newer', () => {
    // The floor is NODE_MINIMUM — the oldest Node the install test runs on
    // (the hosted install-node22 job). This table does not derive or prove
    // it: a syntax sample cannot see API floors or behaviour changes. It is
    // a tripwire only — any pattern found in the bundle that needs a Node
    // newer than the declared floor fails here.
    const FEATURES: readonly (readonly [RegExp, string])[] = [
      [/\.at\(/, '16.6.0'],           // Array/String.prototype.at
      [/\.replaceAll\(/, '15.0.0'],
      [/\brandomUUID\b/, '14.17.0'],
      [/\.matchAll\(/, '12.0.0'],
      [/\bcpSync\(/, '16.7.0'],
      [/allSettled/, '12.9.0'],
      [/\.flatMap\(/, '11.0.0'],
      [/structuredClone/, '17.0.0'],
      [/\.findLast\(/, '18.0.0'],
      [/\.toSorted\(/, '20.0.0'],
      [/Object\.hasOwn/, '16.9.0'],
      [/\.groupBy\(/, '21.0.0'],
      [/Promise\.withResolvers/, '22.0.0'],
      [/\.toReversed\(/, '20.0.0'],
      [/\.toSpliced\(/, '20.0.0'],
      [/\bfetch\(/, '18.0.0'],
    ];
    const parse = (text: string) => text.split('.').map(part => Number.parseInt(part, 10));
    const atLeast = (a: string, b: string) => {
      const [am, an, ap] = parse(a); const [bm, bn, bp] = parse(b);
      return am! > bm! || (am === bm && (an! > bn! || (an === bn && ap! >= bp!)));
    };
    const engines = (manifest()['engines'] as { node: string })['node'];
    expect(engines).toBe('>=22.0.0');
    expect(engines).toBe(`>=${NODE_MINIMUM}`);
    for (const [pattern, since] of FEATURES) {
      if (pattern.test(bundle())) expect(atLeast(NODE_MINIMUM, since), `${pattern} needs Node ${since}`).toBe(true);
    }
  });
  it('refuses a Node below the floor by running, and runs on one at or above it', () => {
    // The bundle itself runs under a faked Node version: a --require preload
    // (CommonJS, so it runs before the ESM entry and its node-check import)
    // replaces process.versions with a copy whose `node` is the fake. Only
    // the version string changes; the real runtime executes everything.
    const dir = temp();
    const preload = join(dir, 'fake-node-version.cjs');
    writeFileSync(preload, "Object.defineProperty(process, 'versions', { value: { ...process.versions, node: process.env.BT12_FAKE_NODE }, configurable: true });\n");
    const entry = join(out, 'package', 'dist', 'box.js');
    const run = (fake: string | undefined) => spawnSync(process.execPath, [...(fake === undefined ? [] : ['--require', preload]), entry, 'bounty', 'help'], {
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '', BT12_FAKE_NODE: fake ?? '' }
    });
    for (const fake of ['21.99.99', '18.20.4', '16.7.0']) {
      const refused = run(fake);
      expect(refused.status, `${fake}: ${refused.stdout}${refused.stderr}`).toBe(3);
      expect(refused.stderr).toContain('box refused (node-too-old)');
      expect(refused.stderr).toContain(`Node ${NODE_MINIMUM} or later is required — found node ${fake}`);
      expect(refused.stderr).toContain('https://nodejs.org');
      expect(refused.stdout).toBe('');
    }
    // At the floor exactly, and on the real runtime, it continues to the command.
    for (const fake of ['22.0.0', undefined]) {
      const ran = run(fake);
      expect(ran.status, `${fake ?? process.versions.node}: ${ran.stdout}${ran.stderr}`).toBe(0);
      expect(ran.stdout).toContain('the journey');
      expect(ran.stderr).not.toContain('node-too-old');
    }
  });
});
