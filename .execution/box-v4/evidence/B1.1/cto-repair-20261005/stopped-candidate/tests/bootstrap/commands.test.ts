import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
describe('honest capability and gate commands', () => {
  it('reports unavailable suites with a nonzero exit', () => {
    const result = spawnSync(process.execPath, ['scripts/suite.mjs', 'missing-suite-fixture'], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ suite: 'missing-suite-fixture', status: 'unavailable', assurance: 'unverified' });
  });
  it('cannot claim real runtime success from local tests', () => {
    const result = spawnSync(process.execPath, ['scripts/suite.mjs', 'runner', '--real'], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).status).toBe('unavailable');
  });
  it('fails the final delivery verifier until required gates exist', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-mvp.mjs'], { cwd: root, encoding: 'utf8', timeout: 10000 });
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ software: 'incomplete', realIsolatedRunner: 'unverified', independentReview: 'unverified', humanPilot: 'not_conducted' });
  });
  it('does not print environment credentials in doctor output', () => {
    const canary = 'synthetic-doctor-secret-canary';
    const output = execFileSync(process.execPath, ['scripts/doctor.mjs', '--json', '--passive'], { cwd: root, encoding: 'utf8', timeout: 10000, env: { ...process.env, PRIVATE_DATABASE_URL: canary, MODEL_API_KEY: canary, RUNNER_SSH_KEY: canary } });
    expect(output).not.toContain(canary);
    expect(JSON.parse(output)).toMatchObject({ schemaVersion: 1, runner: { hostExecutionAllowed: false, realValidation: 'unverified' }, databases: { private: 'unverified', external: 'unverified' } });
  });
  it('keeps the external application independent from private modules', () => {
    const manifest = JSON.parse(readFileSync('services/external-api/package.json', 'utf8')) as { dependencies: Record<string, string> };
    expect(Object.keys(manifest.dependencies).filter(name => name.includes('private'))).toEqual([]);
    const source = readFileSync('apps/contributor-portal/src/bootstrap/main.tsx', 'utf8');
    expect(source).not.toContain('private.localhost');
    expect(source).not.toContain('credentials: \'include\'');
  });
});
