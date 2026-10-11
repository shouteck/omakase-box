import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { build } from 'vite';
import { acquireHostRuntime } from '../../../scripts/host-test-runtime.mjs';

it('actual synthetic PostgreSQL stores immutable exact approvals under session/CSRF/concurrency checks', async () => {
  const journal = JSON.parse(await readFile(resolve('services/private-api/db/migrations/meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> };
  const migrations = await Promise.all(journal.entries.filter(entry => entry.tag !== '0006_immutable_release_content').map(entry => readFile(resolve(`services/private-api/db/migrations/${entry.tag}.sql`), 'utf8')));
  const schemaSql = await readFile(resolve('services/private-api/db/migrations/0006_immutable_release_content.sql'), 'utf8');
  expect(schemaSql).toBe(await readFile(resolve('services/private-api/releases/schema.sql'), 'utf8'));
  const bundle = await build({ configFile: false, root: resolve('services/private-api'), logLevel: 'silent', build: { ssr: 'releases/live-fixture.ts', write: false, minify: false, sourcemap: false, rollupOptions: { output: { inlineDynamicImports: true } } } });
  const chunks = (Array.isArray(bundle) ? bundle : 'output' in bundle ? bundle.output : []) as Array<{ type?: string; code?: string }>;
  const chunk = chunks.find(item => item.type === 'chunk' && typeof item.code === 'string');
  expect(chunk?.code).toBeTruthy();
  const source = `${chunk!.code}\ntry { console.log(JSON.stringify(await runReleaseFixture(${JSON.stringify(migrations)},${JSON.stringify(schemaSql)}))); } catch (error) { console.error(error instanceof Error ? error.message : 'release_fixture_failed'); process.exitCode=1; }\n`;
  const runtime = await acquireHostRuntime();
  try {
    const result = await runtime.exec('private-api', ['--input-type=module'], { input: source, timeout: 60000, env: { SYNTHETIC_RELEASE_FIXTURE: 'synthetic-fixture' } });
    expect(result.code, result.stderr.slice(-4000)).toBe(0);
    const report = JSON.parse(result.stdout.trim().split('\n').at(-1)!) as Record<string, unknown>;
    expect(report).toMatchObject({ assurance: 'tested', realCustomerData: false, immutableAssets: 'tested', ownerSession: 'tested', csrf: 'tested', roleDenial: 'tested', approvalConcurrency: 'tested', staleIntent: 'tested', signature: 'tested' });
  } finally { await runtime.cleanup(); }
}, 90000);
