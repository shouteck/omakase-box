import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('seeds only a tagged synthetic workspace, preserves content-addressed snapshots and excludes answers', () => {
  const run = () => JSON.parse(execFileSync(process.execPath, ['scripts/demo-seed.mjs'], { encoding: 'utf8' }));
  const first = run(); const second = run();
  expect(first).toEqual(second); expect(first.referenceSolutionsIncluded).toBe(false);
  const snapshot = JSON.parse(readFileSync(`.runtime/private-shop-demo/snapshot-${first.snapshotHash}.json`, 'utf8'));
  expect(snapshot.assets.every((asset: { path: string }) => asset.path.startsWith('src/') || asset.path.startsWith('config/'))).toBe(true);
  expect(snapshot.assets.some((asset: { path: string }) => asset.path.includes('reference-solutions'))).toBe(false);
  expect(snapshot.assets.some((asset: { path: string }) => asset.path === 'src/private/eligibility.ts')).toBe(true);
  expect(JSON.parse(readFileSync('.runtime/private-shop-demo/identity.json', 'utf8')).kind).toBe('synthetic-private-shop-demo');
});
