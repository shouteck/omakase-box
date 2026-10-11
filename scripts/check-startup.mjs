import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { root } from './process.mjs';

for (const service of ['private-api', 'external-api']) {
  const canary = 'synthetic-invalid-runtime-secret-canary';
  const result = spawnSync(process.execPath, [`services/${service}/dist/main.js`], {
    cwd: root, encoding: 'utf8', timeout: 5000,
    env: { SYNTHETIC_BOOTSTRAP_ONLY: 'false', PRIVATE_DATABASE_HOST: canary, SystemRoot: process.env.SystemRoot ?? '' }
  });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('bootstrap API could not start.'));
  assert.ok(!result.stderr.includes(canary));
  assert.ok(!result.stderr.includes('Error:'));
  console.log(JSON.stringify({ assurance: 'tested', service, missingConfiguration: 'failed_closed', rawPrivateError: 'not_exposed' }));
}
