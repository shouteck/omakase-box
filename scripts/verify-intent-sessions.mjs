import assert from 'node:assert/strict';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { acquireHostRuntime } from './host-test-runtime.mjs';

const runtime = await acquireHostRuntime();
try {
  const bundle = await build({ configFile: false, root: fileURLToPath(new URL('../services/private-api/', import.meta.url)), logLevel: 'silent', build: { ssr: 'intents/session-fixture.ts', write: false, minify: false, sourcemap: false, rollupOptions: { output: { inlineDynamicImports: true } } } });
  const chunks = Array.isArray(bundle) ? bundle : 'output' in bundle ? bundle.output : [];
  const chunk = chunks.find(item => item.type === 'chunk' && typeof item.code === 'string');
  assert.ok(chunk?.code, 'Intent session fixture bundle did not produce a chunk.');
  const result = await runtime.exec('private-api', ['--input-type=module'], { input: chunk.code, timeout: 60000, env: { SYNTHETIC_INTENT_FIXTURE: 'private-task-mvp-synthetic' } });
  assert.equal(result.code,0,'Synthetic intent session verification failed.');
  const report=JSON.parse(result.stdout);
  assert.equal(report.assurance,'tested');assert.equal(report.realCustomerData,false);
  console.log(JSON.stringify(report));
} finally { await runtime.cleanup(); }
