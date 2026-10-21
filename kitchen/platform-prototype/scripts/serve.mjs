#!/usr/bin/env node
// Serves a folder of static files on localhost. Plain Node, no dependencies.
//   node serve.mjs [folder] [port]      (defaults: ./site or ./out, 4310)
// It also stands in for the one thing the board's server does per viewer:
// GET /prototype-server/methods?solver=&viewer=&bounty= answers a solver's
// owner-only payment methods from grants.json (./server.json next to this
// file, or ../server/grants.json), only where a grant names that viewer.
// Those values are never in the static export.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
const root = resolve(arg ?? [join(here, 'site'), join(here, '..', 'out')].find(d => existsSync(d)) ?? '.');
const port = Number(process.argv[3] ?? 4310);
const grantsFile = [join(here, 'server.json'), join(here, '..', 'server', 'grants.json')].find(p => existsSync(p));
const grants = grantsFile ? JSON.parse(readFileSync(grantsFile, 'utf8')).grants : null;

/** The server's answer for owner-only methods: a grant for exactly this viewer, solver and page, or a refusal that says why. */
export function ownerOnlyAnswer(list, q) {
  if (!list) return [503, { error: 'This copy runs without the prototype server\'s grants. Next: start it with node serve.mjs from its own folder.' }];
  const g = list.find(x => x.viewer === q.viewer && x.solver === q.solver && (x.bounty ?? '') === (q.bounty ?? ''));
  if (!g) return [403, { error: `Not shown: ${q.solver} shows these only to an owner who owes them, on that bounty's page.` }];
  return [200, { prototype: 'Stand-in for the board server: the real board answers only the signed-in account a grant names.', methods: g.methods }];
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8', '.xml': 'application/rss+xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

// Next's client navigation asks for `__next.b.$d$id.__PAGE__.txt`; the static
// export writes it as `__next.b/$d$id/__PAGE__.txt`. Without this mapping
// every in-app link 404s and falls back to a slow full page load.
export function segmentFile(p) {
  const dir = dirname(p); const name = p.slice(dir.length + 1);
  const m = /^__next\.(.+)\.(__PAGE__|__layout__|[^.]+)\.txt$/.exec(name);
  if (!m) return p;
  const [first, ...rest] = m[1].split('.');
  return join(dir, `__next.${first}`, ...rest, `${m[2]}.txt`);
}

async function file(p) { try { const s = await stat(p); return s.isFile() ? p : s.isDirectory() && existsSync(join(p, 'index.html')) ? join(p, 'index.html') : null; } catch { return null; } }

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/prototype-server/methods') {
    const [code, body] = ownerOnlyAnswer(grants, Object.fromEntries(url.searchParams));
    res.writeHead(code, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' }).end(JSON.stringify(body));
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([\\/])+/, '');
  const target = resolve(root, rel);
  if (target !== root && !target.startsWith(root + sep)) { res.writeHead(403).end('Outside the site folder.'); return; }
  let found = await file(target) ?? await file(`${target}.html`) ?? await file(segmentFile(target));
  let status = 200;
  if (!found) { found = await file(join(root, '404.html')); status = 404; }
  if (!found) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found.'); return; }
  const body = await readFile(found);
  const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
  if (status === 200 && req.headers['if-none-match'] === etag) { res.writeHead(304, { etag }).end(); return; }
  res.writeHead(status, { 'content-type': TYPES[extname(found)] ?? 'application/octet-stream', etag, 'cache-control': 'no-cache' });
  res.end(body);
}).listen(port, '127.0.0.1', () => console.log(`Serving ${root} at http://localhost:${port}/  (Ctrl+C to stop)`));
