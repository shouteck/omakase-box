// The deployed form: Cloudflare Workers Free, static assets and D1 (PLATFORM-UX
// section 8). The owner deploys it (DEPLOY.md); nothing here needs an account to build.
import { handle } from './api.js';
import type { Env } from './github.js';
import { refresh } from './refresh.js';

// Reads one run may spend. Runs every minute (wrangler.toml), so each stays small enough for 10 ms of CPU.
const TICK_READS = 6;

export default {
  fetch: (request: Request, env: Env, context: { waitUntil(work: Promise<unknown>): void }): Promise<Response> => handle(request, { ...env, tickReads: TICK_READS, defer: work => context.waitUntil(work) }),
  scheduled: async (_event: unknown, env: Env): Promise<void> => { await refresh({ ...env, tickReads: TICK_READS }); }
};
