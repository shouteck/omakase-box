// Every read of GitHub goes through one budget. The numbers, stated:
// unauthenticated GitHub allows 60 requests an hour, so a refresh may spend 15.
// With a token GitHub allows 5,000 an hour, and a Workers Free invocation allows
// 50 subrequests, so a refresh spends at most 45. The deployed Worker runs every
// minute and asks for less (tickReads): Workers Free allows 10 ms of CPU.
import type { PayPalEnv } from './paypal.js';
import { getMetas, metaStatement, setMeta } from './store.js';
import type { Db } from './store.js';

export const TICK_MINUTES = 15;
export const LIMITS = {
  anonymous: { hour: 60, tick: 15 },
  token: { hour: 5000, tick: 45 }
} as const;

export interface Env extends PayPalEnv {
  readonly DB: Db;
  readonly GITHUB_API?: string;
  /** Created by the owner later; none exists now. Absent means unauthenticated. */
  readonly GITHUB_TOKEN?: string;
  /** The owner's OAuth app (README). Absent: sign-in says it is not set up. */
  readonly GITHUB_OAUTH_CLIENT_ID?: string;
  readonly GITHUB_OAUTH_CLIENT_SECRET?: string;
  /** Where people sign in; only the local stand-in sets this. */
  readonly GITHUB_WEB?: string;
  readonly now?: () => number;
  /** The board's static export (Workers static assets, or the local host's files). */
  readonly ASSETS?: { fetch(request: Request): Promise<Response> };
  /** Only the local stand-in sets this: pages then say the data is invented. */
  readonly SAMPLE?: boolean;
  /** Work that outlives the answer (Workers' waitUntil). Absent: it is awaited. */
  readonly defer?: (work: Promise<unknown>) => void;
  /** Reads a refresh or a look may spend, when less than the stated budget. */
  readonly tickReads?: number;
  /** How long a closed bounty's details may stand, when longer than an open one's. A hint reads it sooner. */
  readonly closedStaleMs?: number;
  /** The platform's Stripe key and webhook secret (PF11). Absent: pay on merge says it is not set up. */
  readonly STRIPE_SECRET_KEY?: string;
  readonly STRIPE_WEBHOOK_SECRET?: string;
  /** Only tests and the local stand-in set this. */
  readonly STRIPE_API?: string;
}

/** The budget for this refresh is spent; the next one resumes. Not a failure. */
export class BudgetSpent extends Error {}
/** GitHub could not answer: its rate limit, or the network. Named, never swallowed. */
export class GitHubUnavailable extends Error {}

export type Answer = { readonly status: number; readonly json: unknown };

const HOUR = 3600000;

export class GitHub {
  private spent = 0;
  private reserved = 0;
  private readonly base: string;
  private readonly limit: { readonly hour: number; readonly tick: number };

  constructor(private readonly env: Env, private readonly tickLimit: boolean) {
    this.base = env.GITHUB_API ?? 'https://api.github.com';
    const limit = env.GITHUB_TOKEN === undefined ? LIMITS.anonymous : LIMITS.token;
    this.limit = { hour: limit.hour, tick: Math.min(limit.tick, env.tickReads ?? limit.tick) };
  }

  get used(): number { return this.spent; }

  private now(): number { return this.env.now?.() ?? Date.now(); }

  private async take(): Promise<void> {
    if (this.tickLimit && this.spent >= this.limit.tick) throw new BudgetSpent();
    if (this.spent >= this.reserved) await this.reserve();
    this.spent += 1;
  }

  /** Counts first, so a run cut off mid-flight still counted against the hour: all a refresh may spend, in one write. settle() gives back the rest. */
  private async reserve(): Promise<void> {
    const db = this.env.DB;
    const meta = await getMetas(db, ['paused_until', 'budget_hour', 'budget_used']);
    if (Number(meta.get('paused_until') ?? 0) > this.now()) throw new GitHubUnavailable(`GitHub's rate limit for this hour is used up`);
    const hour = String(Math.floor(this.now() / HOUR));
    const used = meta.get('budget_hour') === hour ? Number(meta.get('budget_used') ?? 0) : 0;
    const room = this.limit.hour - used;
    if (room <= 0) throw new BudgetSpent();
    const grant = Math.min(room, this.tickLimit ? this.limit.tick - this.spent : 1);
    await db.batch([metaStatement(db, 'budget_hour', hour), metaStatement(db, 'budget_used', String(used + grant))]);
    this.reserved += grant;
  }

  async settle(): Promise<void> {
    const unspent = this.reserved - this.spent;
    if (unspent <= 0) return;
    this.reserved = this.spent;
    await this.env.DB.prepare(`UPDATE meta SET value = CAST(MAX(0, CAST(value AS INTEGER) - ?) AS TEXT) WHERE key = 'budget_used'`).bind(unspent).run();
  }

  async get(path: string): Promise<Answer> {
    await this.take();
    let response: Response;
    try {
      response = await fetch(`${this.base}${path}`, {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'open-bounty-board',
          ...(this.env.GITHUB_TOKEN === undefined ? {} : { authorization: `Bearer ${this.env.GITHUB_TOKEN}` })
        },
        signal: AbortSignal.timeout(15000)
      });
    } catch {
      throw new GitHubUnavailable('GitHub could not be reached');
    }
    const remaining = response.headers.get('x-ratelimit-remaining');
    if ((response.status === 403 || response.status === 429) && (remaining === '0' || response.headers.has('retry-after'))) {
      const reset = Number(response.headers.get('x-ratelimit-reset') ?? 0) * 1000;
      const retry = Number(response.headers.get('retry-after') ?? 0) * 1000;
      await setMeta(this.env.DB, 'paused_until', String(Math.max(reset, this.now() + retry)));
      throw new GitHubUnavailable(`GitHub's rate limit for this hour is used up`);
    }
    if (response.status >= 500) throw new GitHubUnavailable(`GitHub answered ${response.status}`);
    if (!response.ok) return { status: response.status, json: null };
    try {
      return { status: response.status, json: await response.json() };
    } catch {
      throw new GitHubUnavailable('GitHub sent an answer that could not be read');
    }
  }
}

/** The hard stop: only a repository GitHub itself says is public. A 404 is not public. */
export const isPublicRepository = (answer: Answer): boolean => {
  if (answer.status !== 200 || answer.json === null || typeof answer.json !== 'object') return false;
  const repository = answer.json as Record<string, unknown>;
  return repository['private'] === false && repository['visibility'] === 'public';
};
