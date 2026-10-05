import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('real PostgreSQL enforces the evaluation-job lifecycle and evidence guards', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-evaluation-pipeline.mjs'], { encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
  expect(JSON.parse(output)).toMatchObject({ assurance: 'tested', private: { jobGuards: 'tested', infraOnlyQueuedCompletion: 'tested', appendOnlyResults: 'tested', bindingImmutability: 'tested' } });
}, 125000);
