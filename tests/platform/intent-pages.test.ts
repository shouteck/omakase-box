import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { assetsFrom } from '../../packages/box-platform/src/local.js';
import { rig, type Rig } from './support.js';

const ORIGIN = 'https://board.test';
const OUT = fileURLToPath(new URL('../../packages/box-platform/out/', import.meta.url));
const PUBLIC = ['/', '/agents/', '/delegate/', '/earn/', '/how/', '/board/', '/numbers/', '/privacy/', '/terms/'];

describe('intent entry points', () => {
  let r: Rig;
  const ask = (path: string, method = 'GET') => handle(new Request(`${ORIGIN}${path}`, { method }), { ...r.env, ASSETS: assetsFrom(OUT) });
  beforeAll(async () => { r = await rig('not-a-real-token'); });
  afterAll(() => r.close());

  it.each([
    ['/delegate/', 'Delegate a stuck GitHub issue to another coding agent', 'No CLI? Agents using the HTTP API or connectors', '/earn/'],
    ['/earn/', 'Find paid GitHub bounties for coding agents', 'No CLI is required:', '/delegate/']
  ])('serves %s as crawlable HTML with metadata and an honest setup CTA', async (path, title, today, other) => {
    const answer = await ask(path);
    expect(answer.status).toBe(200);
    expect(answer.headers.get('content-type')).toContain('text/html');
    const html = await answer.text();
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${title}</h1>`));
    expect(html).toContain(`rel="canonical" href="https://omakasebox.dev${path}"`);
    expect(html).toMatch(/<meta name="description" content="[^"]*AI coding agent[^"]*"/);
    expect(html).toContain(today);
    expect(html).toContain('npx -y omakase-box setup');
    expect(html).toContain('href="https://github.com/shouteck/omakase-skills"');
    expect(html).toContain(`href="${other}"`);
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
    expect(main.length).toBeGreaterThan(500);
    expect(main.replaceAll('Omakase Box', '')).not.toMatch(/\b(?:Omakase|Box)\b/);
  });

  it('shows real CLI steps in order and discovery after the skill and CLI', async () => {
    const delegate = await (await ask('/delegate/')).text();
    const earn = await (await ask('/earn/')).text();
    let previous = -1;
    for (const command of ['omakase-box create --task', 'omakase-box post &lt;id&gt; --preview', 'omakase-box post &lt;id&gt;</code>', 'omakase-box status &lt;id&gt;', 'omakase-box look &lt;id&gt; &lt;number&gt;', 'omakase-box apply &lt;id&gt; &lt;number&gt;']) {
      const at = delegate.indexOf(command);
      expect(at, command).toBeGreaterThan(previous);
      previous = at;
    }
    expect(earn.indexOf('Agent Skill')).toBeLessThan(earn.indexOf('omakase-box take &lt;id&gt;'));
    expect(earn.indexOf('omakase-box take &lt;id&gt;')).toBeLessThan(earn.indexOf('omakase-box submit &lt;id&gt;'));
    expect(earn.indexOf('omakase-box submit &lt;id&gt;')).toBeLessThan(earn.indexOf('find_bounties'));
    expect(earn).toContain('get_bounty');
    expect(earn).toContain('https://omakasebox.dev/mcp');
    expect(earn).toContain('It may have no open paid bounties');
    const agents = await (await ask('/agents/')).text();
    expect(agents.indexOf('href="/delegate/"')).toBeLessThan(agents.indexOf('href="/earn/"'));
  });

  it('PF54: public copy explains no-CLI agents and issue-comment payments without promising success', async () => {
    const agents = await (await ask('/agents/')).text();
    for (const fact of ['POST /api/agents/import', '{issue,reward}', 'approve_with', 'POST /api/agents/prepare', 'push the exact commit', 'returned title/body', 'Fixes #N', 'mark it ready for review', '/api/payment-setup/poster', '/api/payment-setup/solver', '/setup/&lt;kind&gt;/', '?bounty=&lt;id&gt;', 'omakase approve &lt;id&gt; $&lt;amount&gt; on merge', 'repository switch', 'prepared branch posts', 'exactly one linked PR', 'omakase pay &lt;id&gt;', 'omakase paid &lt;id&gt;', 'not provider-verified', 'Provider refusal']) expect(agents).toContain(fact);
    for (const path of PUBLIC) {
      const html = await (await ask(path)).text();
      expect(html).not.toMatch(/Monid|[Hh]uman approves rewards and pays manually|[Hh]uman approves each reward and pays manually/);
    }
    const how = await (await ask('/how/')).text();
    expect(how).toContain('The CLI only shows what is owed and records a payment');
    expect(how).toContain('on the GitHub issue');
    const privacy = await (await ask('/privacy/')).text();
    expect(privacy).toContain('vault token id and a label keyed by GitHub id');
    expect(privacy).toContain('per-bounty limit');
    const terms = await (await ask('/terms/')).text();
    expect(terms).toContain('not provider-verified');
    expect(terms).toContain('saved Stripe card or PayPal Vault');
  });

  it('lists exactly the public canonical pages in XML, including on an empty board', async () => {
    const answer = await ask('/sitemap.xml');
    expect(answer.status).toBe(200);
    expect(answer.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    const xml = await answer.text();
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1])).toEqual(PUBLIC.map(path => `https://omakasebox.dev${path}`));
    for (const path of PUBLIC) expect((await ask(path)).status, path).toBe(200);
    expect(xml).not.toMatch(/sign-in|\/me\/|\/b\/|\/auth\/|\/post\/|\/docs\//);
  });

  it.each(['/post', '/post/', '/docs', '/docs/'])('permanently redirects %s without fetching a missing asset', async path => {
    for (const method of ['GET', 'HEAD']) {
      const answer = await ask(path, method);
      expect(answer.status).toBe(308);
      expect(answer.headers.get('location')).toBe(`${ORIGIN}${path.startsWith('/post') ? '/delegate/' : '/agents/'}`);
    }
  });

  it('refuses writes and leaves unknown pages as 404s', async () => {
    for (const path of ['/sitemap.xml', '/post', '/docs']) expect((await ask(path, 'POST')).status).toBe(405);
    expect((await ask('/no-intent-page/')).status).toBe(404);
  });
});
