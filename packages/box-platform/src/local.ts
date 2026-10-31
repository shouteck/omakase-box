// The board on one machine: the same handle() and refresh() as the Worker, over
// node's HTTP, with node:sqlite for D1 and the stand-in for GitHub. Nothing leaves localhost.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { handle } from './api.js';
import type { Env } from './github.js';
import { localDb } from './local-db.js';
import { refresh } from './refresh.js';
import { seedDemo, Standin } from '../standin/standin.js';

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };

/** What Workers static assets does: a file, a folder's index.html, or the 404 page. */
export function assetsFrom(directory: string): NonNullable<Env['ASSETS']> {
  const root = resolve(directory);
  const found = (path: string): string | null => {
    const target = resolve(root, `.${path}`);
    if (target !== root && !target.startsWith(root + sep)) return null;
    if (existsSync(target) && statSync(target).isFile()) return target;
    const index = join(target, 'index.html');
    return existsSync(index) ? index : null;
  };
  return {
    fetch: async request => {
      let file: string | null = null;
      try { file = found(decodeURIComponent(new URL(request.url).pathname)); } catch { file = null; }
      const page = file ?? join(root, '404.html');
      if (!existsSync(page)) return new Response('Not found.', { status: 404 });
      return new Response(readFileSync(page), { status: file === null ? 404 : 200, headers: { 'content-type': TYPES[extname(page)] ?? 'application/octet-stream' } });
    }
  };
}

export type LocalBoard = { url: string; standin: Standin; env: Env; refresh(): ReturnType<typeof refresh>; stop(): Promise<void> };

export async function startLocal(options: { schema: string; out: string; port?: number; now?: () => number; seed?: (standin: Standin) => void }): Promise<LocalBoard> {
  const standin = new Standin();
  const api = await standin.start();
  (options.seed ?? (s => seedDemo(s, Date.now())))(standin);
  const db = localDb(options.schema);
  const env: Env = { DB: db, GITHUB_API: api, GITHUB_WEB: api, GITHUB_OAUTH_CLIENT_ID: standin.oauthClientId, GITHUB_OAUTH_CLIENT_SECRET: standin.oauthClientSecret, ASSETS: assetsFrom(options.out), SAMPLE: true, ...(options.now ? { now: options.now } : {}) };
  const server = createServer(async (request, response) => {
    try {
      const method = request.method ?? 'GET';
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      const headers = new Headers(Object.entries(request.headers).flatMap(([name, value]) => typeof value === 'string' ? [[name, value] as [string, string]] : []));
      const answer = await handle(new Request(`http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`, { method, headers, ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }) }), env);
      // Object.fromEntries would keep only one of several set-cookie headers.
      const cookies = answer.headers.getSetCookie();
      response.writeHead(answer.status, { ...Object.fromEntries(answer.headers), ...(cookies.length > 0 ? { 'set-cookie': cookies } : {}) });
      response.end(Buffer.from(await answer.arrayBuffer()));
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain' }).end(`The board failed: ${String(error)}`);
    }
  });
  await new Promise<void>(done => server.listen(options.port ?? 0, '127.0.0.1', done));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the board has no port');
  return {
    url: `http://localhost:${address.port}`, standin, env,
    refresh: () => refresh(env),
    stop: async () => {
      server.closeAllConnections();
      await new Promise(done => server.close(done));
      await standin.stop();
      db.close();
    }
  };
}
