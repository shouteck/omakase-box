import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { parsePrivateEnvironment } from '../../../services/private-api/bootstrap/environment.js';
import { parseExternalEnvironment } from '../../../services/external-api/bootstrap/environment.js';

const compose = parse(readFileSync('infra/compose.yaml', 'utf8'));
const privateConfig = compose.services['private-api'].environment as Record<string, string>;
const externalConfig = compose.services['external-api'].environment as Record<string, string>;

describe('trusted-service configuration (static evidence, not real isolation)', () => {
  it('validates distinct private and external configuration', () => {
    expect(parsePrivateEnvironment(privateConfig).PRIVATE_DATABASE_HOST).toBe('db-private');
    expect(parseExternalEnvironment(externalConfig).EXTERNAL_DATABASE_HOST).toBe('db-external');
  });
  it('fails when configuration is missing', () => {
    expect(() => parsePrivateEnvironment({})).toThrow();
    expect(() => parseExternalEnvironment({})).toThrow();
  });
  it.each(['PRIVATE_DATABASE_URL', 'PRIVATE_SESSION_KEY', 'MODEL_API_KEY', 'OLLAMA_ENDPOINT'])('rejects private environment credential %s in the external process', key => {
    expect(() => parseExternalEnvironment({ ...externalConfig, [key]: 'synthetic-private-canary' })).toThrow('Private configuration');
  });
  it('rejects external references to private secret files and private DB', () => {
    expect(() => parseExternalEnvironment({ ...externalConfig, EXTERNAL_SESSION_KEY_FILE: '/run/secrets/private_session_key' })).toThrow();
    expect(() => parseExternalEnvironment({ ...externalConfig, EXTERNAL_DATABASE_HOST: 'db-private' })).toThrow();
    expect(() => parseExternalEnvironment({ ...externalConfig, EXTERNAL_STORAGE_ROOT: '/data/private' })).toThrow();
  });
  it('does not grant external containers private networks, volumes or keys', () => {
    const external = compose.services['external-api'];
    expect(external.networks).toEqual(['external_database', 'external_ingress', 'assignment_delivery']);
    expect(compose.networks.assignment_delivery).toEqual({ internal: true });
    expect(external.volumes).toEqual(['external_storage:/data/external']);
    expect(external.secrets).toEqual(['external_db_password', 'external_session_key', 'release_public_key', 'external_bridge_key', 'external_assignment_public_key', 'external_receipt_key', 'external_permit_key', 'external_import_public_key']);
    expect(external.secrets).not.toContain('private_release_key');
    expect(compose.services['db-private'].networks).not.toEqual(compose.services['db-external'].networks);
    expect(compose.services['db-private'].environment.POSTGRES_USER).not.toBe(compose.services['db-external'].environment.POSTGRES_USER);
  });
  it('publishes API ports only on loopback and no DB ports', () => {
    expect(compose.services['private-api'].ports).toEqual(['127.0.0.1:4000:4000']);
    expect(compose.services['external-api'].ports).toEqual(['127.0.0.1:4001:4001']);
    expect(compose.services['db-private'].ports).toBeUndefined();
    expect(compose.services['db-external'].ports).toBeUndefined();
    expect(Object.keys(compose.services)).not.toContain('runner');
  });
  it('keeps the external image free of private application source', () => {
    const dockerfile = readFileSync('infra/trusted.Dockerfile', 'utf8');
    const externalBuild = dockerfile.split('AS external-build')[1]?.split('FROM node:')[0];
    const externalRuntime = dockerfile.split('AS external-api')[1];
    expect(externalBuild).toBeDefined();
    expect(externalRuntime).toBeDefined();
    expect(externalBuild).not.toContain('COPY services/private-api/src');
    expect(externalRuntime).not.toContain('/services/private-api');
    expect(dockerfile).not.toContain('COPY . .');
    expect(readFileSync('.env.example', 'utf8')).not.toMatch(/PASSWORD=|SECRET=|TOKEN=/);
  });
});
