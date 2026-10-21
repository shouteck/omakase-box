#!/usr/bin/env node
// Serves a folder of static files on localhost. Plain Node, no dependencies.
//   node serve.mjs [folder] [port]      (defaults: ./site or ./out, 4310)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
const root = resolve(arg ?? [join(here, 'site'), join(here, '..', 'out')].find(d => existsSync(d)) ?? '.');
const port = Number(process.argv[3] ?? 4310);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8', '.xml': 'application/rss+xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

async function file(p) { try { const s = await stat(p); return s.isFile() ? p : s.isDirectory() && existsSync(join(p, 'index.html')) ? join(p, 'index.html') : null; } catch { return null; } }

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([\\/])+/, '');
  const target = resolve(root, rel);
  if (target !== root && !target.startsWith(root + sep)) { res.writeHead(403).end('Outside the site folder.'); return; }
  let found = await file(target) ?? await file(`${target}.html`);
  let status = 200;
  if (!found) { found = await file(join(root, '404.html')); status = 404; }
  if (!found) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found.'); return; }
  const body = await readFile(found);
  const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
  if (status === 200 && req.headers['if-none-match'] === etag) { res.writeHead(304, { etag }).end(); return; }
  res.writeHead(status, { 'content-type': TYPES[extname(found)] ?? 'application/octet-stream', etag, 'cache-control': 'no-cache' });
  res.end(body);
}).listen(port, '127.0.0.1', () => console.log(`Serving ${root} at http://localhost:${port}/  (Ctrl+C to stop)`));
