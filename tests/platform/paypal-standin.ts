// A PayPal stand-in: the calls the board makes, on localhost, shaped as the sandbox answered in PF13's proof.
// Like PayPal, it pays any payee it is handed: the payee and amount are the board's to enforce.
import { createServer, type Server } from 'node:http';

export type Order = { id: string; status: string; request: string | null; payee: string; amount: string; custom_id: string; capture: { id: string; status: string } | null };

export class PayPalStandin {
  orders: Order[] = [];
  calls: string[] = [];
  captures: string[] = [];
  /** Who logs in on PayPal's page, by the code they come back with. */
  logins = new Map<string, Record<string, unknown>>();
  /** What PayPal's own signature check answers. */
  verification = 'SUCCESS';
  verified: string[] = [];
  captureStatus = new Map<string, string>();
  /** Accounts PayPal knows: as in the proof, a made-up merchant_id is refused. */
  known = new Set(['SOLVERPAYPAL1', 'OTHERPAYPAL22']);
  private byRequest = new Map<string, Order>();
  private next = 1;
  private server: Server | null = null;

  approve(id: string): void { this.orders.find(order => order.id === id)!.status = 'APPROVED'; }
  private show(order: Order) {
    return {
      id: order.id, status: order.status,
      purchase_units: [{ custom_id: order.custom_id, amount: { currency_code: 'USD', value: order.amount }, payee: { merchant_id: order.payee }, ...(order.capture ? { payments: { captures: [order.capture] } } : {}) }],
      links: [{ rel: 'payer-action', href: `https://www.sandbox.paypal.test/checkoutnow?token=${order.id}` }]
    };
  }

  private answer(method: string, path: string, body: string, request: string | null, authorization: string): { status: number; json: unknown } {
    if (path === '/v1/oauth2/token') {
      const form = new URLSearchParams(body);
      if (form.get('grant_type') === 'authorization_code') return this.logins.has(form.get('code') ?? '') ? { status: 200, json: { access_token: `person:${form.get('code')}` } } : { status: 400, json: { error: 'invalid_grant' } };
      return { status: 200, json: { access_token: 'app' } };
    }
    if (path === '/v1/identity/oauth2/userinfo') return { status: 200, json: this.logins.get(authorization.replace('Bearer person:', '')) ?? {} };
    if (path === '/v1/notifications/verify-webhook-signature') {
      this.verified.push(body);
      return { status: 200, json: { verification_status: this.verification } };
    }
    if (method === 'POST' && path === '/v2/checkout/orders') {
      const stored = request === null ? undefined : this.byRequest.get(request);
      if (stored !== undefined) return { status: 200, json: this.show(stored) };
      const sent = JSON.parse(body) as { purchase_units: [{ custom_id: string; amount: { value: string }; payee: { merchant_id: string } }] };
      const unit = sent.purchase_units[0];
      if (!this.known.has(unit.payee.merchant_id)) return { status: 422, json: { name: 'UNPROCESSABLE_ENTITY', message: 'words of PayPal that must not reach a page', details: [{ issue: 'PAYEE_ACCOUNT_INVALID' }] } };
      const order: Order = { id: `ORDER${this.next++}`, status: 'PAYER_ACTION_REQUIRED', request, payee: unit.payee.merchant_id, amount: unit.amount.value, custom_id: unit.custom_id, capture: null };
      this.orders.push(order);
      if (request !== null) this.byRequest.set(request, order);
      return { status: 200, json: this.show(order) };
    }
    let match = /^\/v2\/checkout\/orders\/(\w+)\/capture$/.exec(path);
    if (match && method === 'POST') {
      const order = this.orders.find(entry => entry.id === match![1]);
      if (order?.status === 'COMPLETED') return { status: 422, json: { details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] } };
      if (order?.status !== 'APPROVED') return { status: 422, json: { details: [{ issue: 'ORDER_NOT_APPROVED' }] } };
      order.status = 'COMPLETED';
      order.capture = { id: `CAPTURE${this.next++}`, status: 'COMPLETED' };
      this.captures.push(order.id);
      return { status: 201, json: this.show(order) };
    }
    match = /^\/v2\/checkout\/orders\/(\w+)$/.exec(path);
    if (match) {
      const order = this.orders.find(entry => entry.id === match![1]);
      return order === undefined ? { status: 404, json: {} } : { status: 200, json: this.show(order) };
    }
    match = /^\/v2\/payments\/captures\/(\w+)$/.exec(path);
    if (match) return { status: 200, json: { id: match[1], status: this.captureStatus.get(match[1]!) ?? 'COMPLETED' } };
    return { status: 404, json: { message: `no such route ${path}` } };
  }

  async start(): Promise<string> {
    this.server = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      this.calls.push(`${request.method} ${url.pathname}`);
      const key = request.headers['paypal-request-id'];
      const answer = this.answer(request.method ?? 'GET', url.pathname, Buffer.concat(chunks).toString(), typeof key === 'string' ? key : null, request.headers.authorization ?? '');
      response.writeHead(answer.status, { 'content-type': 'application/json' }).end(JSON.stringify(answer.json));
    });
    await new Promise<void>(done => this.server!.listen(0, '127.0.0.1', done));
    const address = this.server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    return `http://127.0.0.1:${address.port}`;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise(done => this.server?.close(done));
  }
}
