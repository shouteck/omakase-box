import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('applies all forward migrations and replays on fresh identified synthetic databases without dropping data', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-empty-migrations.mjs'], { encoding: 'utf8', timeout: 60000, stdio: 'pipe' });
  const reports = output.trim().split('\n').map(line => JSON.parse(line));
  expect(reports).toHaveLength(2);
  for (const report of reports) expect(report).toMatchObject({ assurance: 'tested', emptyDatabaseMigration: 'tested', replay: 'tested', tableCount: 10, cleanup: 'preserved_no_drop' });
}, 65000);
