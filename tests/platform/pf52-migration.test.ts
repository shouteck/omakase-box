import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../packages/box-platform/src/worker.js';
import { commitFor, type StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { MINUTE, NOW, rig, type Rig } from './support.js';
import { StripeStandin } from './stripe-standin.js';
import { PayPalStandin } from './paypal-standin.js';

const ID = 'bt-00000000000a';
const REPO = 'owner/migrated';
const HEAD = 'd'.repeat(40);
const at = (minutes: number) => new Date(NOW + minutes * MINUTE).toISOString();
const migration = readFileSync(new URL('../../packages/box-platform/migrations/pf52.sql', import.meta.url), 'utf8');
let r: Rig;
let stripe: StripeStandin;
let paypal: PayPalStandin;

beforeEach(async () => {
  r = await rig('standin-read');
  stripe = new StripeStandin(); paypal = new PayPalStandin();
  Object.assign(r.env, { STRIPE_SECRET_KEY: 'standin', STRIPE_API: await stripe.start(), PAYPAL_CLIENT_ID: 'standin', PAYPAL_SECRET: 'standin', PAYPAL_API: await paypal.start() });
  const fetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error(`Migration test refused non-local host: ${url.hostname}`);
    return fetch(input, init);
  });
  for (const column of ['approval_at', 'approved_amount', 'merge_consent', 'merge_rail']) await r.env.DB.prepare(`ALTER TABLE bounties DROP COLUMN ${column}`).run();
  await r.env.DB.prepare('ALTER TABLE charges DROP COLUMN origin').run();
  for (const table of ['payment_preferences', 'paypal_vault', 'paypal_vault_setup']) await r.env.DB.prepare(`DROP TABLE ${table}`).run();
  await r.env.DB.prepare("DELETE FROM migrations WHERE name = 'pf52.sql'").run();
  const columns = (await r.env.DB.prepare('PRAGMA table_info(bounties)').all<{ name: string }>()).results.map(row => row.name);
  expect(columns.filter(name => ['approval_at', 'approved_amount', 'merge_consent', 'merge_rail'].includes(name))).toEqual([]);
  expect((await r.env.DB.prepare('PRAGMA table_info(charges)').all<{ name: string }>()).results.map(row => row.name)).not.toContain('origin');
  expect(await r.env.DB.prepare("SELECT name FROM sqlite_master WHERE name IN ('payment_preferences', 'paypal_vault', 'paypal_vault_setup')").all()).toEqual({ results: [] });
});
afterEach(async () => { vi.restoreAllMocks(); await stripe.stop(); await paypal.stop(); await r.close(); });

type Scenario = {
  name: string;
  source: 'listed' | 'posted';
  approval: 'comment' | 'pending' | null;
  comment?: 'plain' | 'old-consent' | 'late-consent';
  lateSwitch?: boolean;
  lateSolver?: boolean;
  landed?: boolean;
  refused?: boolean;
  payable?: boolean;
};
const scenarios: Scenario[] = [
  { name: 'plain listed approval stays uncharged despite enabled repository and ready solver', source: 'listed', approval: 'comment', comment: 'plain' },
  { name: 'direct listing stays uncharged without explicit consent', source: 'listed', approval: null },
  { name: 'plain prepared approval stays uncharged', source: 'posted', approval: 'comment', comment: 'plain' },
  { name: 'pending prepared import cannot gain merge consent from a plain comment', source: 'posted', approval: 'pending', comment: 'plain' },
  { name: 'legacy posted merge before the repository switch stays uncharged', source: 'posted', approval: null, lateSwitch: true },
  { name: 'legacy solver-not-ready stays terminal after the solver connects', source: 'posted', approval: null, refused: true, lateSolver: true },
  { name: 'new direct-listing consent cannot charge its pre-approval merge', source: 'listed', approval: null, comment: 'late-consent' },
  { name: 'already authorized legacy posted merge remains payable', source: 'posted', approval: null, payable: true },
  { name: 'never-evaluated legacy posted merge uses current readiness, not readiness at GitHub merge time', source: 'posted', approval: null, lateSolver: true, payable: true },
  { name: 'historical explicit direct-listing consent is read and can authorize its later merge', source: 'listed', approval: null, comment: 'old-consent', payable: true },
  { name: 'historical direct-listing consent cannot trust the old unverified on-default flag', source: 'listed', approval: null, comment: 'old-consent', landed: false },
  { name: 'historical explicit pending-prepared consent is read and can authorize its later merge', source: 'posted', approval: 'pending', comment: 'old-consent', payable: true }
];

describe.each(['stripe', 'paypal'] as const)('PF52 migrated pre-PF52 data: %s scheduled worker', rail => {
  it.each(scenarios)('$name', async scenario => {
    r.standin.repositories.set(REPO, { visibility: 'public', language: 'TypeScript' });
    r.standin.accountIds.set('owner', 8001); r.standin.accountIds.set('solver', 7001);
    const issue: StandinIssue = { id: ID, repository: REPO, number: 12, title: 'Old merge', task: 'A pre-PF52 bounty', poster: 'owner', amount: 45, createdAt: at(-120),
      plain: scenario.source === 'listed', state: 'closed', closedAt: at(-60),
      pulls: [{ number: 41, author: 'solver', state: 'closed', merged_at: at(-60), created_at: at(-90), head: HEAD, landed: scenario.landed !== false }] };
    if (scenario.comment) issue.comments = [{ login: 'owner', association: 'OWNER', body: `omakase approve ${ID} $45${scenario.comment === 'plain' ? '' : ' on merge'}`, created_at: at(scenario.comment === 'late-consent' ? 1 : -100) }];
    r.standin.issues.push(issue);
    await r.env.DB.prepare("INSERT INTO repositories (name, default_branch, read_at) VALUES (?, 'main', ?)").bind(REPO, NOW).run();
    await r.env.DB.prepare(`INSERT INTO bounties (id, repository, issue_number, title, task, poster, poster_id, issue_state, amount, created_at, work_commit, seen_at, source, approval, approval_proof, listed_by_id, listed_by, listed_seq)
      VALUES (?, ?, 12, 'Old merge', 'A pre-PF52 bounty', 'owner', 8001, 'closed', 45, ?, ?, ?, ?, ?, ?, 8001, 'owner', 1)`)
      .bind(ID, REPO, at(-120), commitFor(ID), NOW, scenario.source, scenario.approval, scenario.approval === 'comment' ? `https://github.com/${REPO}/issues/12#issuecomment-1` : null).run();
    await r.env.DB.prepare(`INSERT INTO pull_requests (bounty_id, number, author, author_id, state, opened_at, merged_at, association, head_sha, on_default, head_on_default_at_sight)
      VALUES (?, 41, 'solver', 7001, 'merged', ?, ?, 'NONE', ?, 1, 0)`).bind(ID, at(-90), at(-60), HEAD).run();
    await r.env.DB.prepare('INSERT INTO pay_repositories (github_id, repository, on_at, limit_per_bounty) VALUES (8001, ?, ?, 45)').bind(REPO, at(scenario.lateSwitch ? -30 : -110)).run();
    stripe.accounts.set('acct_solver', { charges_enabled: !scenario.lateSolver });
    await r.env.DB.prepare("INSERT INTO stripe_accounts (github_id, account_id, ready) VALUES (7001, 'acct_solver', ?)").bind(scenario.lateSolver ? 0 : 1).run();
    if (!scenario.lateSolver) await r.env.DB.prepare("INSERT INTO paypal_accounts (github_id, payer_id, at) VALUES (7001, 'SOLVERPAYPAL1', ?)").bind(NOW - 115 * MINUTE).run();
    await r.env.DB.prepare("INSERT INTO pay_settings (github_id, customer_id, payment_method, limit_per_bounty) VALUES (8001, 'cus_owner', 'pm_owner', 50)").run();
    if (scenario.refused) await r.env.DB.prepare("INSERT INTO charges (bounty_id, state, at) VALUES (?, 'solver-not-ready', ?)").bind(ID, NOW - 55 * MINUTE).run();

    await r.env.DB.batch(migration.split(';').filter(sql => sql.trim()).map(sql => r.env.DB.prepare(sql)));
    expect(await r.env.DB.prepare('SELECT approval_at, approved_amount, merge_consent, merge_rail FROM bounties WHERE id = ?').bind(ID).first())
      .toEqual({ approval_at: null, approved_amount: null, merge_consent: 0, merge_rail: null });
    expect(await r.env.DB.prepare('SELECT on_default FROM pull_requests WHERE bounty_id = ?').bind(ID).first()).toEqual({ on_default: scenario.source === 'listed' ? null : 1 });
    expect(await r.env.DB.prepare("SELECT name FROM migrations WHERE name = 'pf52.sql'").first()).toEqual({ name: 'pf52.sql' });
    if (scenario.refused) expect(await r.env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(`merge_payment_off/${ID}`).first()).toEqual({ value: 'solver-not-ready' });
    if (rail === 'paypal') {
      await r.env.DB.prepare("INSERT INTO paypal_vault (github_id, payment_token, label, limit_per_bounty) VALUES (8001, 'VAULT1', 'Saved PayPal', 50)").run();
      await r.env.DB.prepare("INSERT INTO payment_preferences (github_id, rail, fallback) VALUES (8001, 'paypal', 0)").run();
    }
    if (scenario.lateSolver) {
      stripe.accounts.set('acct_solver', { charges_enabled: true });
      await r.env.DB.prepare('UPDATE stripe_accounts SET ready = 1 WHERE github_id = 7001').run();
      await r.env.DB.prepare("INSERT INTO paypal_accounts (github_id, payer_id, at) VALUES (7001, 'SOLVERPAYPAL1', ?)").bind(NOW).run();
    }

    for (let tick = 0; tick < 360; tick++) { r.clock.at += MINUTE; await worker.scheduled({}, r.env); }

    expect(await r.env.DB.prepare('SELECT id FROM bounties WHERE id = ?').bind(ID).first()).toEqual({ id: ID });
    expect(await r.env.DB.prepare('SELECT on_default FROM pull_requests WHERE bounty_id = ?').bind(ID).first()).toEqual({ on_default: scenario.landed === false ? 0 : 1 });
    if (scenario.source === 'listed') expect(r.standin.requests.some(path => path.includes(`/compare/${HEAD}...main`))).toBe(true);
    const consent = scenario.comment === 'old-consent' || scenario.comment === 'late-consent';
    expect(await r.env.DB.prepare('SELECT merge_consent FROM bounties WHERE id = ?').bind(ID).first()).toEqual({ merge_consent: consent ? 1 : 0 });
    if (consent) expect(await r.env.DB.prepare('SELECT approval_at FROM bounties WHERE id = ?').bind(ID).first()).toEqual({ approval_at: at(scenario.comment === 'late-consent' ? 1 : -100) });
    expect(stripe.charged()).toHaveLength(scenario.payable && rail === 'stripe' ? 1 : 0);
    expect(stripe.calls.filter(call => call.startsWith('POST /v1/payment_intents'))).toHaveLength(scenario.payable && rail === 'stripe' ? 1 : 0);
    expect(paypal.orders).toHaveLength(scenario.payable && rail === 'paypal' ? 1 : 0);
    expect(paypal.calls.filter(call => call === 'POST /v2/checkout/orders')).toHaveLength(scenario.payable && rail === 'paypal' ? 1 : 0);
    expect(paypal.captures).toHaveLength(scenario.payable && rail === 'paypal' ? 1 : 0);
    expect(await r.env.DB.prepare("SELECT COUNT(*) AS n FROM charges WHERE state = 'paid'").first()).toEqual({ n: scenario.payable ? 1 : 0 });
    if (scenario.refused) expect(await r.env.DB.prepare('SELECT state FROM charges WHERE bounty_id = ?').bind(ID).first()).toEqual({ state: 'solver-not-ready' });
  });
});
