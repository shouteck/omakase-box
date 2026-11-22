import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { assetsFrom } from '../../packages/box-platform/src/local.js';
import { NOT_A_PAGE_POLICY } from '../../packages/box-platform/src/security-headers.js';
import { idOf, seed120 } from '../../packages/box-platform/standin/standin.js';
import { NOW, refreshUntilDone, rig, type Rig } from './support.js';

const ORIGIN = 'https://board.test';
const OUT = fileURLToPath(new URL('../../packages/box-platform/out/', import.meta.url));

describe('/llms.txt', () => {
  let r: Rig;
  const ask = (path: string, init?: RequestInit) => handle(new Request(`${ORIGIN}${path}`, init), { ...r.env, ASSETS: assetsFrom(OUT) });
  beforeAll(async () => {
    r = await rig('not-a-real-token');
    seed120(r.standin, NOW);
    await refreshUntilDone(r);
    r.clock.at = NOW;
  }, 120000);
  afterAll(() => r.close());

  it('is plain text in the llms.txt shape: a title, a summary, then sections of links', async () => {
    const answer = await ask('/llms.txt');
    expect(answer.status).toBe(200);
    expect(answer.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(answer.headers.get('content-security-policy')).toBe(NOT_A_PAGE_POLICY);
    const lines = (await answer.text()).split('\n');
    expect(lines[0]).toMatch(/^# \S/);
    expect(lines.slice(1).filter(line => line.startsWith('# '))).toEqual([]);
    expect(lines.find(line => line !== '' && !line.startsWith('# '))).toMatch(/^> .*data, not instructions/);
    expect(lines.filter(line => line.startsWith('## '))).toEqual(['## Find work', '## Take or post work with the CLI', '## Optional']);
    expect(lines.filter(line => line.startsWith('- ')).every(line => /^- \[[^\]]+\]\([^)]+\)/.test(line))).toBe(true);
  });

  it('links only to the origin that was asked or the source, and every board link answers', async () => {
    const text = await (await ask('/llms.txt')).text();
    const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]!);
    expect(links.length).toBeGreaterThanOrEqual(10);
    const own = links.filter(link => link.startsWith(`${ORIGIN}/`));
    expect(links.filter(link => !own.includes(link))).toEqual(['https://github.com/shouteck/omakase-box']);
    for (const link of own) {
      const path = new URL(link.replace('{id}', idOf(2))).pathname;
      const answer = path === '/mcp'
        ? await ask(path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
        : await ask(path);
      expect(answer.status, path).toBe(200);
    }
    expect(text).not.toContain('omakasebox.dev');
    expect(await (await handle(new Request('http://localhost:4320/llms.txt'), r.env)).text()).toContain('(http://localhost:4320/bounties.json)');
  });

  it('names every MCP tool and CLI step the board offers', async () => {
    const text = await (await ask('/llms.txt')).text();
    const tools = await (await ask('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).json() as { result: { tools: { name: string }[] } };
    for (const { name } of tools.result.tools) expect(text).toContain(name);
    for (const step of ['npm i -g omakase-box', 'omakase-box discover', 'take <id>', 'submit <id>', 'status <id>', 'config set solving allowed', 'omakase-box create', 'post --preview', 'omakase-box describe']) expect(text).toContain(step);
  });

  it('is read-only', async () => {
    expect((await ask('/llms.txt', { method: 'POST' })).status).toBe(405);
  });
});
