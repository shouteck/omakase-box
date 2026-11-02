// A Stripe stand-in: the calls the board makes, on localhost, counting every charge.
// Like Stripe, it charges any account it is handed: the limit and payee are the board's to enforce.
import { createServer, type Server } from 'node:http';

export type Intent = { id: string; account: string; amount: number; status: string; metadata: Record<string, string>; application: string | null };

export class StripeStandin {
  accounts = new Map<string, { charges_enabled: boolean; revoked?: boolean }>();
  intents: Intent[] = [];
  calls: string[] = [];
  /** What the next charge does. */
  card: 'ok' | 'declined' | 'authenticate' | 'refused' | 'busy' | 'limited' = 'ok';
  /** Words Stripe's error carries, for the redaction test. */
  errorText = 'Your card was declined.';
  private keys = new Map<string, unknown>();
  private next = 1;
  private server: Server | null = null;
  url = '';

  expireRefused = false;
  /** Pages for a payment. Paying one is what the owner does on Stripe's page. */
  sessions = new Map<string, { id: string; url: string; account: string; status: string; payment_status: string; payment_intent: string | null; amount_total: number; bounty: string; methods: string | null; adaptive: string | null }>();
  payPage(id: string): Intent {
    const session = this.sessions.get(id)!;
    const intent: Intent = { id: `pi_${this.next++}`, account: session.account, amount: session.amount_total, status: 'succeeded', metadata: { bounty: session.bounty }, application: 'ca_platform' };
    this.intents.push(intent);
    Object.assign(session, { status: 'complete', payment_status: 'paid', payment_intent: intent.id });
    return intent;
  }

  charged = (account?: string): Intent[] => this.intents.filter(intent => intent.status === 'succeeded' && (account === undefined || intent.account === account));

  /** Refuses what Stripe refuses, and what would make this setup cost the platform: Stripe must collect the fees and carry the losses. */
  private accountV2(body: string, version: unknown): { status: number; json: unknown } {
    const refuse = (message: string) => ({ status: 400, json: { error: { type: 'invalid_request_error', message } } });
    if (typeof version !== 'string' || version === '') return refuse('You did not provide an API version.');
    const asked = JSON.parse(body) as { dashboard?: string; identity?: { country?: string }; configuration?: { merchant?: { capabilities?: { card_payments?: { requested?: boolean } } } }; defaults?: { responsibilities?: { fees_collector?: string; losses_collector?: string } } };
    if (asked.dashboard !== 'full' || asked.configuration?.merchant?.capabilities?.card_payments?.requested !== true || asked.defaults?.responsibilities?.fees_collector !== 'stripe' || asked.defaults.responsibilities.losses_collector !== 'stripe' || typeof asked.identity?.country !== 'string') return refuse('This setup would not be the one that costs the platform nothing.');
    const id = `acct_standin${this.next++}`;
    this.accounts.set(id, { charges_enabled: false });
    return { status: 200, json: { id } };
  }

  private answer(method: string, path: string, query: URLSearchParams, form: URLSearchParams, account: string | null): { status: number; json: unknown } {
    const error = (status: number, code: string, extra: object = {}) => ({ status, json: { error: { code, message: this.errorText, ...extra } } });
    // As Stripe answered a new platform in PF18's proof.
    if (method === 'POST' && path === '/v1/accounts') return { status: 400, json: { error: { type: 'invalid_request_error', message: 'Stripe no longer recommends Accounts v1 for new Connect integrations.' } } };
    if (method === 'POST' && path === '/v1/account_links') return { status: 200, json: { url: `https://connect.stripe.test/${form.get('account')}` } };
    if (method === 'POST' && path === '/v1/customers') return { status: 200, json: { id: `cus_${this.next++}` } };
    if (method === 'POST' && path === '/v1/checkout/sessions') {
      const id = `cs_test_${this.next++}`;
      const url = `https://checkout.stripe.test/${id}`;
      if (form.get('mode') === 'payment') this.sessions.set(id, { id, url, account: account!, status: 'open', payment_status: 'unpaid', payment_intent: null, amount_total: Number(form.get('line_items[0][price_data][unit_amount]')), bounty: form.get('payment_intent_data[metadata][bounty]') ?? '', methods: form.get('payment_method_types[0]'), adaptive: form.get('adaptive_pricing[enabled]') });
      return { status: 200, json: { id, url } };
    }
    let match = /^\/v1\/checkout\/sessions\/(cs_[\w]+)\/expire$/.exec(path);
    if (match && method === 'POST') {
      if (this.expireRefused) return { status: 400, json: { error: { message: 'Only open sessions can be expired.' } } };
      const session = this.sessions.get(match[1]!);
      if (session !== undefined) session.status = 'expired';
      return { status: 200, json: session ?? {} };
    }
    match = /^\/v1\/checkout\/sessions\/(cs_[\w]+)$/.exec(path);
    if (match && this.sessions.has(match[1]!)) return { status: 200, json: this.sessions.get(match[1]!) };
    if (match) return { status: 200, json: { id: match[1], customer: this.sessionCustomer, status: 'complete', setup_intent: { payment_method: { id: 'pm_saved', card: { brand: 'visa', last4: '4242' } } } } };
    match = /^\/v1\/accounts\/(acct_\w+)$/.exec(path);
    if (match) {
      const found = this.accounts.get(match[1]!);
      return found === undefined || found.revoked ? { status: 403, json: { error: { code: 'account_invalid', message: 'Application access may have been revoked.' } } } : { status: 200, json: { id: match[1], charges_enabled: found.charges_enabled } };
    }
    if (path === '/v1/payment_intents/search') {
      const bounty = /metadata\['bounty'\]:'([^']+)'/.exec(query.get('query') ?? '')?.[1];
      return { status: 200, json: { data: this.intents.filter(intent => intent.account === account && intent.metadata['bounty'] === bounty && intent.status === 'succeeded') } };
    }
    if (method === 'POST' && path === '/v1/payment_methods') return { status: 200, json: { id: `pm_clone_${this.next++}` } };
    if (method === 'POST' && path === '/v1/payment_intents') {
      if (this.card === 'declined') return error(402, 'card_declined', { type: 'card_error' });
      if (this.card === 'refused') return { status: 400, json: { error: { type: 'invalid_request_error', message: 'Your account cannot currently make charges.' } } };
      if (this.card === 'busy') return error(409, 'idempotency_key_in_use', { type: 'idempotency_error' });
      if (this.card === 'limited') return error(429, 'rate_limit', { type: 'rate_limit_error' });
      const intent: Intent = { id: `pi_${this.next++}`, account: account!, amount: Number(form.get('amount')), status: this.card === 'ok' ? 'succeeded' : 'requires_payment_method', metadata: { bounty: form.get('metadata[bounty]') ?? '' }, application: 'ca_platform' };
      this.intents.push(intent);
      return this.card === 'authenticate' ? error(402, 'authentication_required', { type: 'card_error', payment_intent: { id: intent.id } }) : { status: 200, json: intent };
    }
    if (method === 'POST' && /\/cancel$|\/detach$/.test(path)) return { status: 200, json: {} };
    return { status: 404, json: { error: { message: `no such route ${path}` } } };
  }

  /** The customer the next read session belongs to. */
  sessionCustomer = '';

  async start(): Promise<string> {
    this.server = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      const key = request.headers['idempotency-key'];
      const account = typeof request.headers['stripe-account'] === 'string' ? request.headers['stripe-account'] : null;
      this.calls.push(`${request.method} ${url.pathname}${account === null ? '' : ` as ${account}`}`);
      const stored = typeof key === 'string' ? this.keys.get(key) : undefined;
      const body = Buffer.concat(chunks).toString();
      const answer = (stored ?? (url.pathname === '/v2/core/accounts' ? this.accountV2(body, request.headers['stripe-version']) : this.answer(request.method ?? 'GET', url.pathname, url.searchParams, new URLSearchParams(body), account))) as { status: number; json: unknown };
      if (typeof key === 'string' && answer.status !== 409 && answer.status !== 429) this.keys.set(key, answer);
      response.writeHead(answer.status, { 'content-type': 'application/json' }).end(JSON.stringify(answer.json));
    });
    await new Promise<void>(done => this.server!.listen(0, '127.0.0.1', done));
    const address = this.server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    return this.url = `http://127.0.0.1:${address.port}`;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise(done => this.server?.close(done));
  }
}
