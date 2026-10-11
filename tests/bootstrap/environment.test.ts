import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('gives demo children only approved system environment variables, never inherited credentials', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `import { developmentEnvironment } from './scripts/process.mjs'; console.log(JSON.stringify(developmentEnvironment({ PATH: 'synthetic/path', SystemRoot: 'synthetic/system', PRIVATE_DATABASE_URL: 'private-canary', MODEL_API_KEY: 'model-canary', UNRELATED_ACCESS_TOKEN: 'token-canary', NODE_OPTIONS: '--inspect' })));`], { encoding: 'utf8', stdio: 'pipe' });
  expect(JSON.parse(output)).toEqual({ PATH: 'synthetic/path', SystemRoot: 'synthetic/system', SYNTHETIC_BOOTSTRAP_ONLY: 'true' });
});
