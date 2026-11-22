// reads: scripts/live-providers.mjs
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const compareProviders = (input: unknown): { ok: boolean; facts: { ok: boolean; words: string }[]; unadvertised: string[] } => JSON.parse(execFileSync(process.execPath, [
  '--input-type=module', '-e', `import { compareProviders } from './scripts/live-providers.mjs'; console.log(JSON.stringify(compareProviders({ webhooks: { Stripe: true, PayPal: true }, ...${JSON.stringify(input)} })))`
], { cwd: root, encoding: 'utf8' }));

const ways = { one_click: ['Stripe', 'PayPal'], on_merge: true };
const secretNames = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'PAYPAL_CLIENT_ID', 'PAYPAL_SECRET', 'PAYPAL_WEBHOOK_ID'];

describe('live provider sign-off cannot rely on sandbox availability', () => {
  it('passes with every advertised provider and required binding', () => {
    expect(compareProviders({ ways, secretNames }).ok).toBe(true);
  });
  it('fails for each missing advertised provider', () => {
    for (const provider of ways.one_click) {
      expect(compareProviders({ ways: { ...ways, one_click: ways.one_click.filter(name => name !== provider) }, secretNames }).ok).toBe(false);
    }
  });
  it('fails for each missing binding, including webhooks', () => {
    for (const missing of secretNames) {
      const result = compareProviders({ ways, secretNames: secretNames.filter(name => name !== missing) });
      expect(result.ok).toBe(false);
      expect(result.facts).toContainEqual({ ok: false, words: `Worker secret name present: ${missing}` });
    }
  });
  it('fails when either check is not run, or data is empty or malformed', () => {
    for (const input of [{}, { ways }, { secretNames }, { ways: {}, secretNames }, { ways, secretNames: [] }, { ways, secretNames, advertised: [] }]) {
      expect(compareProviders(input).ok).toBe(false);
    }
    expect(compareProviders({ ways }).facts).toContainEqual({ ok: false, words: 'Worker secret names: NOT RUN' });
  });
  it('requires on_merge for Stripe and rejects unknown advertised names', () => {
    expect(compareProviders({ ways: { ...ways, on_merge: false }, secretNames }).ok).toBe(false);
    expect(compareProviders({ advertised: ['Other'], ways, secretNames }).ok).toBe(false);
  });
  it('fails for missing, failed and not-run live webhook checks', () => {
    for (const webhooks of [{}, { Stripe: true }, { PayPal: true }, { Stripe: false, PayPal: true }, { Stripe: true, PayPal: false }]) {
      expect(compareProviders({ ways, secretNames, webhooks }).ok).toBe(false);
    }
  });
  it('looks up live registrations without payment calls and rejects wrong URLs, missing and disabled webhooks', () => {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { liveWebhooks } from './scripts/live-providers.mjs';
      const origin = 'https://example.test';
      const env = { PAYPAL_CLIENT_ID: 'test-id', PAYPAL_SECRET: 'test-secret', PAYPAL_WEBHOOK_ID: 'hook', STRIPE_WEBHOOKS_READ_KEY: 'rk_live_test-key' };
      const answers = [];
      const calls = [];
      for (const scenario of ['present', 'wrong-url', 'missing', 'disabled', 'sandbox']) {
        const request = async (url, options) => {
          calls.push([url, options.method ?? 'GET']);
          const token = url.endsWith('/token');
          const paypal = url.includes('paypal.com');
          const expected = scenario === 'wrong-url' ? 'https://wrong.test' : origin;
          return { ok: scenario !== 'missing' || token, json: async () => token ? { access_token: 'test-token' } : paypal ? { id: 'hook', url: expected + '/api/paypal/webhook' } : { data: [{ id: 'stripe-hook', url: expected + '/api/stripe/webhook', livemode: scenario !== 'sandbox', status: scenario === 'disabled' ? 'disabled' : 'enabled' }], has_more: false } };
        };
        answers.push(await liveWebhooks(origin, ['Stripe', 'PayPal'], env, request));
      }
      answers.push(await liveWebhooks(origin, ['Stripe', 'PayPal'], {}, () => { throw new Error('must not call'); }));
      for (const credentials of [{ STRIPE_SECRET_KEY: 'sk_live_test' }, { STRIPE_WEBHOOKS_READ_KEY: 'rk_test_test' }]) {
        answers.push(await liveWebhooks(origin, ['Stripe'], credentials, () => { throw new Error('must not call'); }));
      }
      console.log(JSON.stringify({ answers, calls }));
    `], { cwd: root, encoding: 'utf8' });
    const result = JSON.parse(output);
    expect(result.answers).toEqual([
      { Stripe: true, PayPal: true }, { Stripe: false, PayPal: false },
      { Stripe: false, PayPal: false }, { Stripe: false, PayPal: true },
      { Stripe: false, PayPal: true }, {}, {}, {}
    ]);
    expect(result.calls.filter((call: string[]) => call[1] === 'POST').every((call: string[]) => call[0] === 'https://api-m.paypal.com/v1/oauth2/token')).toBe(true);
    expect(result.calls.every((call: string[]) => !call[0]?.includes('example.test'))).toBe(true);
  });
  it('reports additional live providers without failing and supports a PayPal-only expectation', () => {
    const result = compareProviders({ advertised: ['PayPal'], ways: { ...ways, on_merge: false }, secretNames: secretNames.filter(name => name.startsWith('PAYPAL')) });
    expect(result.ok).toBe(true);
    expect(result.unadvertised).toEqual(['Stripe']);
  });
});
