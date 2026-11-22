import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// What launch copy advertises; runtime PayWays is conditional on deployed keys.
export const ADVERTISED_PROVIDERS = ['Stripe', 'PayPal'];
const BINDINGS = {
  Stripe: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  PayPal: ['PAYPAL_CLIENT_ID', 'PAYPAL_SECRET', 'PAYPAL_WEBHOOK_ID']
};

export function compareProviders({ advertised = ADVERTISED_PROVIDERS, ways = null, secretNames = null, webhooks = {} }) {
  const facts = [];
  const check = (ok, words) => facts.push({ ok, words });
  check(advertised.length > 0, `Advertised providers: ${advertised.join(', ') || '(none)'}`);
  const waysValid = ways !== null && Array.isArray(ways.one_click) && ways.one_click.every(name => typeof name === 'string') && typeof ways.on_merge === 'boolean';
  check(waysValid, ways === null ? '/api/ways: NOT RUN' : `/api/ways: ${waysValid ? 'received' : 'invalid response'}`);
  const secretsValid = Array.isArray(secretNames) && secretNames.every(name => typeof name === 'string');
  check(secretsValid, secretNames === null ? 'Worker secret names: NOT RUN' : `Worker secret names: ${secretsValid ? 'received' : 'invalid response'}`);
  for (const provider of advertised) {
    check(Object.hasOwn(BINDINGS, provider), `Known advertised provider: ${provider}`);
    check(waysValid && ways.one_click.includes(provider), `one_click includes ${provider}`);
    if (provider === 'Stripe') check(waysValid && ways.on_merge === true, 'on_merge is true (Stripe)');
    for (const name of Object.hasOwn(BINDINGS, provider) ? BINDINGS[provider] : []) {
      check(secretsValid && secretNames.includes(name), `Worker secret name present: ${name}`);
    }
    const matched = typeof webhooks[provider] === 'string' && webhooks[provider].length > 0;
    check(matched, `Live ${provider} webhook: ${webhooks[provider] == null ? 'NOT RUN' : matched ? `matched ${webhooks[provider]}` : 'lookup failed or accepted URL missing'}`);
  }
  const unadvertised = waysValid ? ways.one_click.filter(name => !advertised.includes(name)) : [];
  return { ok: facts.every(fact => fact.ok), facts, unadvertised };
}

export async function liveWebhooks(origin, advertised, env = process.env, request = fetch, webhookOrigins = [origin, 'https://open-bounty-board.box-platform.workers.dev']) {
  const results = {};
  const json = async (url, options = {}) => {
    const response = await request(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error();
    return response.json();
  };
  if (advertised.includes('PayPal') && env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET && env.PAYPAL_WEBHOOK_ID) {
    try {
      const token = await json('https://api-m.paypal.com/v1/oauth2/token', {
        method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials'
      });
      if (typeof token.access_token !== 'string' || !token.access_token) throw new Error();
      const webhook = await json(`https://api-m.paypal.com/v1/notifications/webhooks/${encodeURIComponent(env.PAYPAL_WEBHOOK_ID)}`, { headers: { Authorization: `Bearer ${token.access_token}` } });
      results.PayPal = webhook.id === env.PAYPAL_WEBHOOK_ID && webhookOrigins.some(accepted => webhook.url === `${accepted}/api/paypal/webhook`) ? webhook.url : false;
    } catch { results.PayPal = false; }
  }
  if (advertised.includes('Stripe') && env.STRIPE_WEBHOOKS_READ_KEY?.startsWith('rk_live_')) {
    try {
      let after = '';
      results.Stripe = false;
      do {
        const page = await json(`https://api.stripe.com/v1/webhook_endpoints?limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ''}`, { headers: { Authorization: `Bearer ${env.STRIPE_WEBHOOKS_READ_KEY}` } });
        if (!Array.isArray(page.data)) throw new Error();
        const matched = page.data.find(webhook => webhookOrigins.some(accepted => webhook.url === `${accepted}/api/stripe/webhook`) && webhook.livemode === true && webhook.status === 'enabled');
        if (matched) {
          results.Stripe = matched.url;
          break;
        }
        const next = page.has_more ? page.data.at(-1)?.id : '';
        if (page.has_more && (typeof next !== 'string' || !next || next === after)) throw new Error();
        after = next;
      } while (after);
    } catch { results.Stripe = false; }
  }
  return results;
}

export async function main(args = process.argv.slice(2)) {
  let origin = 'https://omakasebox.dev';
  let advertised = ADVERTISED_PROVIDERS;
  let skipSecrets = false;
  let webhookOrigins;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--origin' && args[i + 1]) origin = args[++i];
    else if (args[i] === '--providers' && args[i + 1]) advertised = args[++i].split(',').map(name => name.trim()).filter(Boolean);
    else if (args[i] === '--skip-secrets') skipSecrets = true;
    else if (args[i] === '--webhook-origins' && args[i + 1]) webhookOrigins = args[++i].split(',').map(value => value.trim());
    else throw new Error('Usage: node scripts/live-providers.mjs [--origin URL] [--providers Stripe,PayPal] [--webhook-origins URL,URL] [--skip-secrets]');
  }
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Origin must be an HTTP(S) origin without credentials, path, query or fragment');
  webhookOrigins = (webhookOrigins ?? [url.origin, 'https://open-bounty-board.box-platform.workers.dev']).map(value => {
    const accepted = new URL(value);
    if (!['http:', 'https:'].includes(accepted.protocol) || accepted.username || accepted.password || accepted.pathname !== '/' || accepted.search || accepted.hash) throw new Error('Webhook origins must be HTTP(S) origins without credentials, path, query or fragment');
    return accepted.origin;
  });
  console.log(`Live provider verification: ${url.origin}`);
  console.log(`Checked at: ${new Date().toISOString()}`);
  let ways = null;
  let secretNames = null;
  try {
    const response = await fetch(`${url.origin}/api/ways`, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error();
    ways = await response.json();
  } catch { console.log('/api/ways could not be read successfully.'); }
  if (!skipSecrets && process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    try {
      const wrangler = fileURLToPath(new URL('../packages/box-platform/node_modules/wrangler/bin/wrangler.js', import.meta.url));
      const output = execFileSync(process.execPath, [wrangler, 'secret', 'list', '--name', 'open-bounty-board'], {
        cwd: fileURLToPath(new URL('../packages/box-platform/', import.meta.url)),
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000
      });
      const secrets = JSON.parse(output);
      if (!Array.isArray(secrets) || !secrets.every(secret => typeof secret?.name === 'string')) throw new Error();
      secretNames = secrets.map(secret => secret.name);
    } catch { console.log('Worker secret names could not be read successfully (wrangler output withheld).'); }
  } else console.log(skipSecrets ? 'Worker secret lookup skipped by --skip-secrets.' : 'Worker secret lookup requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.');
  console.log(`Accepted webhook origins: ${webhookOrigins.join(', ')}`);
  const webhooks = await liveWebhooks(url.origin, advertised, process.env, fetch, webhookOrigins);
  if (advertised.includes('Stripe') && webhooks.Stripe == null) console.log('Stripe webhook lookup: NOT RUN; requires STRIPE_WEBHOOKS_READ_KEY (rk_live_ restricted key, Webhook Endpoints: Read).');
  const result = compareProviders({ advertised, ways, secretNames, webhooks });
  for (const fact of result.facts) console.log(`${fact.ok ? 'PASS' : 'FAIL'}: ${fact.words}`);
  console.log(`Live but not advertised: ${result.unadvertised.join(', ') || '(none observed)'}`);
  console.log('Webhook route probe: NOT RUN (POST-only routes; no POST sent to the board).');
  console.log('Scope: availability, secret names and live webhook registrations; no payment or webhook delivery tested.');
  console.log(`Sign-off checks: ${result.ok ? 'PASS' : 'FAIL'}`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
