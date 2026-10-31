// Every read of GitHub goes through one budget. The numbers, stated:
// unauthenticated GitHub allows 60 requests an hour, so a refresh every 15
// minutes may spend 15. With a token GitHub allows 5,000 an hour, and a Workers
// Free invocation allows 50 subrequests, so a refresh spends at most 45.
import { type Db, getMeta, setMeta } from './store.js';

export const TICK_MINUTES = 15;
export const LIMITS = {
  anonymous: { hour: 60, tick: 15 },
  token: { hour: 5000, tick: 45 }
} as const;

export interface Env {
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
}

/** The budget for this refresh is spent; the next one resumes. Not a failure. */
export class BudgetSpent extends Error {}
/** GitHub could not answer: its rate limit, or the network. Named, never swallowed. */
export class GitHubUnavailable extends Error {}

export type Answer = { readonly status: number; readonly json: unknown };

const HOUR = 3600000;

export class GitHub {
  private spent = 0;
  private readonly base: string;
  private readonly limit: { readonly hour: number; readonly tick: number };

  constructor(private readonly env: Env, private readonly tickLimit: boolean) {
    this.base = env.GITHUB_API ?? 'https://api.github.com';
    this.limit = env.GITHUB_TOKEN === undefined ? LIMITS.anonymous : LIMITS.token;
  }

  get used(): number { return this.spent; }

  private now(): number { return this.env.now?.() ?? Date.now(); }

  /** Counts first, so a request cut off mid-flight still counted against the hour. */
  private async take(): Promise<void> {
    if (this.tickLimit && this.spent >= this.limit.tick) throw new BudgetSpent();
    const db = this.env.DB;
    const pausedUntil = Number(await getMeta(db, 'paused_until') ?? 0);
    if (pausedUntil > this.now()) throw new GitHubUnavailable(`GitHub's rate limit for this hour is used up`);
    const hour = Math.floor(this.now() / HOUR);
    const window = await getMeta(db, 'budget_hour');
    const used = window === String(hour) ? Number(await getMeta(db, 'budget_used') ?? 0) : 0;
    if (used >= this.limit.hour) throw new BudgetSpent();
    await setMeta(db, 'budget_hour', String(hour));
    await setMeta(db, 'budget_used', String(used + 1));
    this.spent += 1;
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
