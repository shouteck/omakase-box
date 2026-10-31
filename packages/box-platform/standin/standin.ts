// A GitHub stand-in: the endpoints the board reads, on localhost, with every
// fact seeded so a test can check the board against it. No real GitHub, no token.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { renderFormat } from '../../box-bounty/format.js';

export type StandinPull = { number: number; author: string; state: 'open' | 'closed'; merged_at?: string; created_at: string };
export type StandinEvent = Record<string, unknown>;
export type StandinIssue = {
  id: string; repository: string; number: number; title: string; task: string; poster: string;
  amount: number; createdAt: string; state?: 'open' | 'closed'; closedAt?: string;
  /** Replaces the whole body: for malformed and missing blocks. */
  rawBody?: string;
  pulls?: StandinPull[]; events?: StandinEvent[];
};
export type StandinRepository = { language: string | null; visibility: 'public' | 'private'; default_branch?: string };

export const commitFor = (id: string): string => id.slice(3).padEnd(40, '0');

export function bodyOf(issue: StandinIssue): string {
  const value = { schemaVersion: 2 as const, kind: 'box-bounty' as const, id: issue.id, repository: issue.repository, workCommit: commitFor(issue.id), branch: `box-bounty/${issue.id}`, withChanges: false, createdAt: issue.createdAt, state: { kind: 'open' as const }, reward: { amount: issue.amount, currency: 'USD' as const }, terms: 'merged-solution-earns-whole' as const };
  return [`# Bounty: ${issue.title}`, '', '## What is wanted', '', issue.task, '', '## What was already tried', '', 'No public note was supplied.', '', `<!-- box-bounty:${issue.id} -->`, '', renderFormat(value)].join('\n');
}

export class Standin {
  repositories = new Map<string, StandinRepository>();
  issues: StandinIssue[] = [];
  requests: string[] = [];
  /** Requests left before GitHub answers 403 with x-ratelimit-remaining: 0. */
  rateLimitAfter: number | null = null;
  resetAt = 0;
  /** Who the next person signing in at the stand-in is; a test changes it. */
  signInAs: { id: number; login: string } = { id: 7001, login: 'example-quill' };
  readonly oauthClientId = 'standin-client';
  readonly oauthClientSecret = 'standin-client-word';
  /** Every token handed out, so a test can look for them where they must not be. */
  tokensIssued: string[] = [];
  /** Every authorize address asked for, so a test can read what it requested. */
  authorizeAsked: string[] = [];
  private codes = new Map<string, { id: number; login: string }>();
  private tokens = new Map<string, { id: number; login: string }>();
  private nextOauth = 1;
  private server: Server | null = null;

  /** GitHub's sign-in: answers straight away as `signInAs`, as if the person said yes. */
  private oauth(request: IncomingMessage, url: URL, body: string): { status: number; json?: unknown; location?: string } | null {
    if (url.pathname === '/login/oauth/authorize') {
      this.authorizeAsked.push(url.href);
      if (url.searchParams.get('client_id') !== this.oauthClientId) return { status: 404 };
      const code = `code-${this.nextOauth++}`;
      this.codes.set(code, this.signInAs);
      const back = new URL(url.searchParams.get('redirect_uri') ?? '');
      back.searchParams.set('code', code);
      back.searchParams.set('state', url.searchParams.get('state') ?? '');
      return { status: 302, location: back.href };
    }
    if (url.pathname === '/login/oauth/access_token' && request.method === 'POST') {
      const sent = JSON.parse(body) as { client_id?: string; client_secret?: string; code?: string };
      const who = this.codes.get(sent.code ?? '');
      if (sent.client_secret !== this.oauthClientSecret || who === undefined) return { status: 200, json: { error: 'bad_verification_code' } };
      this.codes.delete(sent.code!);
      const token = `standin-access-${this.nextOauth++}-${who.id}`;
      this.tokens.set(token, who);
      this.tokensIssued.push(token);
      return { status: 200, json: { access_token: token, token_type: 'bearer', scope: '' } };
    }
    if (url.pathname === '/user') {
      const who = this.tokens.get((request.headers.authorization ?? '').replace(/^Bearer /, ''));
      return who === undefined ? { status: 401 } : { status: 200, json: who };
    }
    return null;
  }

  private answer(path: string, query: URLSearchParams): { status: number; json?: unknown } {
    if (path === '/search/issues') {
      const q = query.get('q') ?? '';
      if (!q.includes('label:box-bounty')) return { status: 422 };
      const page = Number(query.get('page') ?? 1);
      const perPage = Number(query.get('per_page') ?? 30);
      // Real search returns public and, for a token that can see them, private
      // issues alike; serving private ones here makes the board's own check count.
      const open = this.issues.filter(issue => !q.includes('is:open') || (issue.state ?? 'open') === 'open');
      return { status: 200, json: { total_count: open.length, incomplete_results: false, items: open.slice((page - 1) * perPage, page * perPage).map(issue => this.issueJson(issue)) } };
    }
    let match = /^\/repos\/([^/]+\/[^/]+)$/.exec(path);
    if (match) {
      const repository = this.repositories.get(match[1]!);
      if (!repository) return { status: 404 };
      return { status: 200, json: { full_name: match[1], private: repository.visibility === 'private', visibility: repository.visibility, language: repository.language, default_branch: repository.default_branch ?? 'main' } };
    }
    match = /^\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)$/.exec(path);
    if (match) {
      const issue = this.issues.find(entry => entry.repository === match![1] && entry.number === Number(match![2]));
      return issue ? { status: 200, json: this.issueJson(issue) } : { status: 404 };
    }
    match = /^\/repos\/([^/]+\/[^/]+)\/pulls$/.exec(path);
    if (match) {
      const issue = this.issues.find(entry => entry.repository === match![1] && `box-bounty/${entry.id}` === query.get('base'));
      return { status: 200, json: (issue?.pulls ?? []).map(pull => ({ number: pull.number, state: pull.state, merged_at: pull.merged_at ?? null, created_at: pull.created_at, user: { login: pull.author }, title: 'A SOLVER WROTE THIS TITLE' })) };
    }
    match = /^\/repos\/([^/]+\/[^/]+)\/commits$/.exec(path);
    if (match) {
      const ref = query.get('sha') ?? '';
      const issue = this.issues.find(entry => entry.repository === match![1] && ref === `refs/box-bounty/${entry.id}`);
      if (!issue?.events) return { status: 404 };
      return { status: 200, json: issue.events.map((_, index) => ({ sha: this.eventSha(issue, index) })) };
    }
    match = /^\/repos\/([^/]+\/[^/]+)\/contents\/event\.json$/.exec(path);
    if (match) {
      const sha = query.get('ref');
      for (const issue of this.issues) for (const [index, event] of (issue.events ?? []).entries()) {
        if (issue.repository === match[1] && this.eventSha(issue, index) === sha) return { status: 200, json: { content: Buffer.from(JSON.stringify(event)).toString('base64') } };
      }
      return { status: 404 };
    }
    return { status: 404 };
  }

  private eventSha(issue: StandinIssue, index: number): string { return `${issue.id.slice(3)}${String(index).padStart(28, '0')}`; }

  private issueJson(issue: StandinIssue): unknown {
    return {
      html_url: `https://github.com/${issue.repository}/issues/${issue.number}`,
      repository_url: `https://api.github.com/repos/${issue.repository}`,
      number: issue.number, title: `[box bounty ${issue.id}] ${issue.title}`, body: issue.rawBody ?? bodyOf(issue),
      state: issue.state ?? 'open', closed_at: issue.closedAt ?? null, user: { login: issue.poster }
    };
  }

  async start(): Promise<string> {
    this.server = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      const signIn = this.oauth(request, url, Buffer.concat(chunks).toString());
      if (signIn !== null) {
        response.writeHead(signIn.status, signIn.location ? { location: signIn.location } : { 'content-type': 'application/json' }).end(signIn.location ? undefined : JSON.stringify(signIn.json ?? { message: 'Not Found' }));
        return;
      }
      this.requests.push(url.pathname);
      if (this.rateLimitAfter !== null) {
        if (this.rateLimitAfter <= 0) {
          response.writeHead(403, { 'content-type': 'application/json', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(this.resetAt) }).end('{"message":"API rate limit exceeded"}');
          return;
        }
        this.rateLimitAfter -= 1;
      }
      const { status, json } = this.answer(url.pathname, url.searchParams);
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json ?? { message: 'Not Found' }));
    });
    await new Promise<void>(resolve => this.server!.listen(0, '127.0.0.1', resolve));
    const address = this.server.address();
    if (address === null || typeof address === 'string') throw new Error('the stand-in has no port');
    return `http://127.0.0.1:${address.port}`;
  }

  stop(): Promise<void> {
    return new Promise(resolve => { this.server?.closeAllConnections(); this.server?.close(() => resolve()); });
  }
}

/** One bounty per state the page shows, one hostile text, one private repository. */
export const STATE_IDS = {
  open: 'bt-0d7e4a3c8b65', waiting: 'bt-2b8d7e01c6a5', merged: 'bt-3a91c0e2d4f1', moreThanOne: 'bt-77aa00bb11cc',
  closed: 'bt-55cc66dd77ee', noReward: 'bt-99ee88dd77cc', hostile: 'bt-abadabadabad', private: 'bt-feedfeedfeed', owed: 'bt-c0ffeec0ffee'
} as const;
export const HOSTILE = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>`;

export function seedStates(standin: Standin, now: number): void {
  const ago = (days: number) => new Date(now - days * 86400000).toISOString();
  const repository = 'example-tidepool/ledger-lite';
  standin.repositories.set(repository, { language: 'TypeScript', visibility: 'public' });
  standin.repositories.set('example-hidden/vault', { language: 'Go', visibility: 'private' });
  const base = { repository, poster: 'example-mara', task: 'Recurring transactions skip the 31st in short months. Make them land on the last day.', amount: 45, createdAt: ago(4) };
  const pull = (number: number, author: string, merged?: string): StandinPull => ({ number, author, state: merged ? 'closed' : 'open', created_at: ago(3), ...(merged ? { merged_at: merged } : {}) });
  standin.issues.push(
    { ...base, id: STATE_IDS.open, number: 48, title: 'Recurring transactions skip the 31st', events: [{ v: 1, type: 'posted', at: ago(4), allowedBy: { decision: 'once', level: 'project' } }] },
    { ...base, id: STATE_IDS.waiting, number: 49, title: 'Import fails on a BOM', pulls: [pull(61, 'example-fern'), pull(62, 'example-quill')] },
    { ...base, id: STATE_IDS.merged, number: 50, title: 'Totals round the wrong way', state: 'closed', closedAt: ago(1), pulls: [pull(63, 'example-fern'), pull(64, 'example-quill', ago(1))], events: [{ v: 1, type: 'posted', at: ago(4), allowedBy: { decision: 'allowed', level: 'project' } }, { v: 1, type: 'merged', at: ago(1), n: 1, mergeCommit: 'a'.repeat(40) }, { v: 1, type: 'paid', at: ago(0), amount: 45, by: 'example-mara', withdrawn: false }] },
    { ...base, id: STATE_IDS.moreThanOne, number: 51, title: 'Dates drift across time zones', state: 'closed', closedAt: ago(1), pulls: [pull(65, 'example-fern', ago(2)), pull(66, 'example-rook', ago(1))] },
    { ...base, id: STATE_IDS.closed, number: 52, title: 'Export to a format nobody uses', state: 'closed', closedAt: ago(2), pulls: [{ ...pull(67, 'example-fern'), state: 'closed' }] },
    { ...base, id: STATE_IDS.noReward, number: 53, title: 'Tidy the settings page', amount: 0 },
    { ...base, id: STATE_IDS.hostile, number: 54, title: `Hostile title ${HOSTILE}`, task: `Hostile task ${HOSTILE}` },
    { ...base, id: STATE_IDS.owed, number: 55, title: 'Duplicate rows after a retry', state: 'closed', closedAt: ago(1), pulls: [pull(68, 'example-quill', ago(1))] },
    { ...base, id: STATE_IDS.private, repository: 'example-hidden/vault', number: 3, title: 'PRIVATE SAMPLE', task: 'PRIVATE SAMPLE TASK' }
  );
}

export function seedDemo(standin: Standin, now: number): void {
  seedStates(standin, now);
  seed120(standin, now);
}

const hex = (n: number): string => n.toString(16).padStart(12, '0');
export const idOf = (n: number): string => `bt-${hex(n)}`;
const LANGUAGES = ['TypeScript', 'Python', 'Go', 'Rust'];

/** 120 public bounties in 8 repositories, every field derived from its number. */
export function seed120(standin: Standin, now: number): void {
  for (let r = 0; r < 8; r++) standin.repositories.set(`example-org/repo-${r}`, { language: LANGUAGES[r % 4]!, visibility: 'public' });
  for (let n = 0; n < 120; n++) {
    standin.issues.push({
      id: idOf(n + 1), repository: `example-org/repo-${n % 8}`, number: n + 1000,
      title: `${n % 2 === 0 ? 'Fix' : 'Add'} thing ${n}`, task: `Task ${n}.`, poster: `poster-${n % 5}`,
      amount: n % 3 === 0 ? 0 : (n % 4 + 1) * 25,
      createdAt: new Date(now - n * 86400000).toISOString(),
      pulls: n % 10 === 0 ? [{ number: n + 5000, author: 'solver-a', state: 'open', created_at: new Date(now - 3600000).toISOString() }] : [],
      events: n % 6 === 0 ? [{ v: 1, type: 'posted', at: new Date(now - n * 86400000).toISOString(), allowedBy: { decision: n % 12 === 0 ? 'once' : 'allowed', level: 'project' } }] : []
    });
  }
}
