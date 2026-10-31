// The deployed form: Cloudflare Workers Free, static assets and D1 (PLATFORM-UX
// section 8). The owner deploys it in PF6; nothing here needs an account to build.
import { handle } from './api.js';
import type { Env } from './github.js';
import { refresh } from './refresh.js';

export default {
  fetch: (request: Request, env: Env, context: { waitUntil(work: Promise<unknown>): void }): Promise<Response> => handle(request, { ...env, defer: work => context.waitUntil(work) }),
  scheduled: async (_event: unknown, env: Env): Promise<void> => { await refresh(env); }
};
