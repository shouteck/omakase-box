import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { TLSSocket } from 'node:tls';
import { selectPlan } from './selection/api.js';
import { applyResponsePolicy, loadResponsePolicy } from './policy/loader.js';

export function createPrivateShopApi() {
  const app = Fastify({ logger: false, bodyLimit: 16384, trustProxy: false });
  const policy = loadResponsePolicy(readFileSync(new URL('../config/response-security.json', import.meta.url), 'utf8'));
  app.addHook('onSend', async (request, reply, payload) => {
    const current = Object.fromEntries(Object.entries(reply.getHeaders()).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
    const updated = applyResponsePolicy(current, policy, { https: request.raw.socket instanceof TLSSocket && request.raw.socket.encrypted, localhost: true, route: request.routeOptions.url ?? '/' });
    for (const name of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'Strict-Transport-Security']) reply.removeHeader(name);
    for (const [name, value] of Object.entries(updated)) reply.header(name, value);
    return payload;
  });
  app.addHook('onRequest', async (request, reply) => {
    if (request.headers.host !== 'private-shop.localhost:4100' || (request.headers.origin && request.headers.origin !== 'http://private-shop.localhost:3100')) return reply.code(403).send({ code: 'forbidden' });
  });
  app.post('/selection', async (request, reply) => {
    const result = selectPlan(request.body, { id: 'synthetic-subject', tier: 'basic', region: 'north' });
    return reply.code(result.status).send(result.body);
  });
  app.get('/health', async () => ({ kind: 'synthetic-private-shop', revision: 'private-shop-before-v1', assurance: 'tested' }));
  app.setErrorHandler(async (_error, _request, reply) => reply.code(500).send({ code: 'internal_error' }));
  return app;
}
