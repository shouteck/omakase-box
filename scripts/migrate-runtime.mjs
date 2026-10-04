import assert from 'node:assert/strict';
import { docker } from './docker.mjs';
import { composeArguments } from './synthetic-runtime.mjs';

for (const service of ['private-api', 'external-api']) {
  const result = await docker([...composeArguments, 'exec', '-T', '--workdir', `/workspace/services/${service}`, service, 'node', 'dist/migrate.js']);
  assert.equal(result.code, 0, `${service} migration failed; private diagnostics must remain private.`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.migration, 'applied');
  console.log(JSON.stringify(report));
}
