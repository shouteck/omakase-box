// The deployed form: Cloudflare Workers Free, static assets and D1 (PLATFORM-UX
// section 8). The owner deploys it (DEPLOY.md); nothing here needs an account to build.
import { handle } from './api.js';
import { settleCharges } from './charge.js';
import { settlePayPal } from './paypal-pay.js';
import type { Env } from './github.js';
import { refresh } from './refresh.js';

// One run spends this little and runs every minute (wrangler.toml): Workers Free allows 10 ms of CPU.
// PF8's numbers read from Cloudflare are in waves/PF8.md.
const SLICE = { tickReads: 2, closedStaleMs: 3600000 };

export default {
  fetch: (request: Request, env: Env, context: { waitUntil(work: Promise<unknown>): void }): Promise<Response> => handle(request, { ...env, ...SLICE, defer: work => context.waitUntil(work) }),
  scheduled: async (_event: unknown, env: Env): Promise<void> => {
    await refresh({ ...env, ...SLICE });
    await settleCharges(env);
    await settlePayPal(env);
  }
};
