// reads: eslint.config.mjs, scripts/suite.mjs, scripts/verify.mjs, package.json, .github/workflows/verify.yml
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));

it('K54: lint reuse reads board TypeScript and config, not unrelated or ignored files', () => {
  const paths = [
    'packages/box-platform/src/worker.ts', 'packages/box-platform/standin/standin.ts',
    'eslint.config.mjs', 'tsconfig.json', 'package.json', 'pnpm-lock.yaml',
    'packages/box-platform/dist/generated.ts', 'packages/box-platform/out/generated.ts',
    'packages/box-platform/node_modules/dependency/index.ts', 'tests/platform/api.test.ts',
    'packages/box-bounty/index.ts', 'waves/K54.md', 'scripts/unrelated.mjs', '',
  ];
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', `import { stepReadsPath } from './scripts/suite.mjs'; console.log(JSON.stringify(${JSON.stringify(paths)}.map(path => stepReadsPath('lint', path))));`], { cwd: root, encoding: 'utf8' });
  expect(JSON.parse(result)).toEqual([true, true, true, true, true, true, false, false, false, false, false, false, false, false]);
});

it('K54: exactly the three promise rules are errors and the hosted command follows install', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', "import config from './eslint.config.mjs'; console.log(JSON.stringify(config.map(({ files, ignores, rules, languageOptions }) => ({ files, ignores, rules, projectService: languageOptions?.parserOptions?.projectService }))));"], { cwd: root, encoding: 'utf8' });
  expect(JSON.parse(result)).toEqual([
    { ignores: ['**/dist/**', '**/out/**', '**/node_modules/**'] },
    { files: ['packages/box-platform/**/*.ts'], projectService: true, rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    } },
  ]);
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  expect(pkg.scripts.lint).toBe('eslint packages/box-platform');
  const workflow = readFileSync(new URL('../../.github/workflows/verify.yml', import.meta.url), 'utf8');
  expect(workflow).toMatch(/install --frozen-lockfile\s+- name: Promise lint\s+run: node scripts\/pnpm.mjs run lint/);
});
