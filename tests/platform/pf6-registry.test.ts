import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';

const read = (path: string): unknown => JSON.parse(readFileSync(new URL(`../../docs/box-v4/launch/${path}`, import.meta.url), 'utf8'));
const schema = read('listings/server.schema.json') as object;
const server = read('server.json') as {
  $schema: string; name: string; description: string; version: string;
  repository: { url: string; source: string }; websiteUrl: string;
  remotes: { type: string; url: string }[];
};
const ajv = new Ajv({ strict: false });
ajv.addFormat('uri', { type: 'string', validate: (value: string) => { try { return Boolean(new URL(value).protocol); } catch { return false; } } });
const validate = ajv.compile(schema);

describe('PF6 remote registry draft (draft-07)', () => {
  it('validates the remote-only document against the vendored schema', () => {
    expect(validate(server), JSON.stringify(validate.errors)).toBe(true);
    expect(server.$schema).toBe('https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json');
    expect(server.name).toBe('io.github.shouteck/omakase-box');
    expect(server.version).toBe('0.1.0');
    expect(server.repository).toEqual({ url: 'https://github.com/shouteck/omakase-box', source: 'github' });
    expect(server.websiteUrl).toBe('https://omakasebox.dev');
    expect(server.remotes).toEqual([{ type: 'streamable-http', url: 'https://open-bounty-board.box-platform.workers.dev/mcp' }]);
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.description).toMatch(/humans approve listings and payments/i);
    expect(JSON.stringify(server)).not.toMatch(/open-bounty-board\.box-platform\.workers\.dev(?!\/mcp)/);
    expect(server.description.indexOf('skill')).toBeLessThan(server.description.indexOf('CLI'));
    expect(server.description.indexOf('CLI')).toBeLessThan(server.description.indexOf('MCP'));
  });
  it('rejects empty metadata, missing remote URLs and oversized descriptions', () => {
    for (const invalid of [{}, { ...server, description: '' }, { ...server, description: 'x'.repeat(101) }, { ...server, remotes: [{ type: 'streamable-http' }] }, { ...server, remotes: [{ type: 'stdio', url: server.websiteUrl }] }]) {
      expect(validate(invalid)).toBe(false);
    }
  });
});
