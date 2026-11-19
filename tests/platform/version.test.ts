import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import worker from '../../packages/box-platform/src/worker.js';
import { assetsFrom } from '../../packages/box-platform/src/local.js';
import { rig } from './support.js';

const PACKAGE = new URL('../../packages/box-platform/', import.meta.url);
const OUT = fileURLToPath(new URL('out/', PACKAGE));
const ROOT = fileURLToPath(new URL('../../', PACKAGE)).replace(/[\\/]+$/, '').replaceAll('\\', '/');

describe('build version', () => {
  it('built version.json contains the current checkout SHA and a UTC build time', () => {
    const version = JSON.parse(readFileSync(new URL('out/version.json', PACKAGE), 'utf8'));
    expect(version.sha).toMatch(/^[0-9a-f]{40}$/);
    const head = execFileSync('git', ['-c', `safe.directory=${ROOT}`, 'rev-parse', 'HEAD'], { cwd: PACKAGE, encoding: 'utf8' }).trim();
    expect(version.sha, 'version.json is stale; rebuild the platform').toBe(head);
    expect(version.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(version.builtAt).toISOString()).toBe(version.builtAt);
    expect(Date.parse(version.builtAt)).toBeLessThanOrEqual(Date.now());
  });

  it('serves the built version publicly as uncached JSON before auth or database access', async () => {
    const r = await rig();
    try {
      const response = await worker.fetch(new Request('https://board.test/version.json', { headers: { 'if-none-match': '*' } }), { ...r.env, ASSETS: assetsFrom(OUT) }, { waitUntil: () => {} });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual(JSON.parse(readFileSync(new URL('out/version.json', PACKAGE), 'utf8')));
      const method = await worker.fetch(new Request('https://board.test/version.json', { method: 'POST' }), r.env, { waitUntil: () => {} });
      expect(method.status).toBe(405);
      expect(method.headers.get('allow')).toBe('GET');
      const missing = await worker.fetch(new Request('https://board.test/version.json'), r.env, { waitUntil: () => {} });
      expect(missing.status).toBe(503);
      expect(missing.headers.get('cache-control')).toBe('no-store');
      const absent = await worker.fetch(new Request('https://board.test/version.json'), { ...r.env, ASSETS: { fetch: async () => new Response('missing', { status: 404 }) } }, { waitUntil: () => {} });
      expect(absent.status).toBe(503);
    } finally { await r.close(); }
  });

  it('rejects empty or malformed CI SHAs instead of writing unknown', () => {
    for (const sha of ['', 'unknown', 'abc123']) {
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import { writeVersion } from './version.mjs'; writeVersion(new URL('./', import.meta.url));"], { cwd: PACKAGE, encoding: 'utf8', env: { ...process.env, GITHUB_SHA: sha } });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('full 40-character Git SHA');
    }
  });

  it('builds without a CI SHA when Git considers the checkout differently owned', () => {
    const { GITHUB_SHA: _sha, ...env } = process.env;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import { writeVersion } from './version.mjs'; console.log(JSON.stringify(writeVersion(new URL('./', import.meta.url))));"], { cwd: PACKAGE, encoding: 'utf8', env: { ...env, GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' } });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const head = execFileSync('git', ['-c', `safe.directory=${ROOT}`, 'rev-parse', 'HEAD'], { cwd: PACKAGE, encoding: 'utf8' }).trim();
    expect(JSON.parse(result.stdout).sha).toBe(head);
  });

  it('fails when Git is unavailable and no CI SHA was supplied', () => {
    const { GITHUB_SHA: _sha, ...env } = process.env;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import { writeVersion } from './version.mjs'; writeVersion(new URL('./', import.meta.url));"], { cwd: PACKAGE, encoding: 'utf8', env: { ...env, PATH: '', Path: '' } });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('git');
  });
});
