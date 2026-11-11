// BT50: a GitHub failure names its cause and a next step without echoing gh's
// words; a read may retry once, a write never does. The token-shaped string and
// the path planted in every failure must reach no output.
import { describe, expect, it } from 'vitest';
import { BountyRefused, loadRecord, postBounty } from '../../../packages/box-bounty/index.js';
import { api, classifyGitHubFailure, limitGitHubCalls, pages, splitResponse } from '../../../packages/box-bounty/gh.js';
import { fixture, leakCanary } from './github-fixture.js';

const FAKE_PATH = 'C:/Users/somebody/.config/gh/hosts.yml';
const planted = `${leakCanary} at ${FAKE_PATH}`;
const headers = (line: string, ...rest: string[]) => [line, ...rest, '', `{"message":"${planted}"}`].join('\r\n');
const NOW = Date.parse('2026-10-31T00:00:00.000Z');
const RESET = NOW / 1000 + 600;
const RESET_TIME = '2026-10-31T00:10:00.000Z';

describe('BT50 the classifier', () => {
  const cases: readonly { name: string; result: Parameters<typeof classifyGitHubFailure>[0]; reason: string; next: string; has?: string }[] = [
    { name: 'spawn failure', result: { error: new Error(planted), status: null }, reason: 'github-unreachable', next: 'check the connection' },
    { name: 'network on stderr', result: { status: 1, stderr: `dial tcp ${planted}: i/o timeout` }, reason: 'github-unreachable', next: 'check the connection' },
    { name: '401 from the status line', result: { status: 1, stdout: headers('HTTP/2.0 401 Unauthorized'), stderr: planted }, reason: 'github-not-signed-in', next: 'gh auth login' },
    { name: '401 from a stderr marker', result: { status: 1, stderr: `gh: Bad credentials (HTTP 401) ${planted}` }, reason: 'github-not-signed-in', next: 'gh auth login' },
    { name: 'gh exit 4, auth required', result: { status: 4, stderr: planted }, reason: 'github-not-signed-in', next: 'gh auth login' },
    { name: '403 rate limit with reset', result: { status: 1, stdout: headers('HTTP/2.0 403 Forbidden', 'X-Ratelimit-Remaining: 0', `X-Ratelimit-Reset: ${RESET}`), stderr: planted }, reason: 'github-rate-limited', next: 'wait until then', has: RESET_TIME },
    { name: '429 with Retry-After', result: { status: 1, stdout: headers('HTTP/2.0 429 Too Many Requests', 'Retry-After: 600'), stderr: planted }, reason: 'github-rate-limited', next: 'wait until then', has: RESET_TIME },
    { name: 'secondary limit, marker only', result: { status: 1, stderr: `You have exceeded a secondary rate limit ${planted}` }, reason: 'github-rate-limited', next: 'wait a few minutes' },
    { name: '403 without a limit', result: { status: 1, stdout: headers('HTTP/2.0 403 Forbidden', 'X-Ratelimit-Remaining: 12'), stderr: planted }, reason: 'github-permission-denied', next: 'an account that can' },
    { name: '404', result: { status: 1, stdout: headers('HTTP/2.0 404 Not Found'), stderr: planted }, reason: 'github-repository-missing', next: 'git remote -v' },
    { name: '500', result: { status: 1, stdout: headers('HTTP/2.0 500 Internal Server Error'), stderr: planted }, reason: 'github-unavailable', next: 'later' },
    { name: '503 from a stderr marker', result: { status: 1, stderr: `HTTP 503 ${planted}` }, reason: 'github-unavailable', next: 'later' },
    { name: 'no marker at all', result: { status: 1, stderr: planted }, reason: 'github-command-failed', next: 'check gh sign-in and access' }
  ];
  for (const entry of cases) {
    it(`${entry.name} -> ${entry.reason}`, () => {
      const refusal = classifyGitHubFailure(entry.result, () => null, NOW);
      expect(refusal.reason).toBe(entry.reason);
      expect(refusal.message).toMatch(/next: /);
      expect(refusal.message.slice(refusal.message.indexOf('next: '))).toContain(entry.next);
      if (entry.has !== undefined) expect(refusal.message).toContain(entry.has);
      expect(refusal.message).not.toContain(leakCanary);
      expect(refusal.message).not.toContain('somebody');
    });
  }

  it('a limit with no time in the response asks /rate_limit, once, and uses what it says', () => {
    let asked = 0;
    const refusal = classifyGitHubFailure({ status: 1, stderr: 'API rate limit exceeded (HTTP 403)' }, () => { asked += 1; return RESET * 1000; }, NOW);
    expect(asked).toBe(1);
    expect(refusal.message).toContain(RESET_TIME);
  });

  it('a header value that is not a time is not repeated', () => {
    const refusal = classifyGitHubFailure({ status: 1, stdout: headers('HTTP/2.0 429 Too Many Requests', `Retry-After: ${planted}`) }, () => null, NOW);
    expect(refusal.message).toContain('did not say until when');
    expect(refusal.message).not.toContain(leakCanary);
  });

  it('splits the header block from the body, and leaves a body without one alone', () => {
    const split = splitResponse('HTTP/2.0 200 OK\r\nX-Ratelimit-Remaining: 5\r\nContent-Type: application/json\r\n\r\n{"HTTP/2.0":"a: b"}');
    expect(split.status).toBe(200);
    expect(split.headers.get('x-ratelimit-remaining')).toBe('5');
    expect(split.body).toBe('{"HTTP/2.0":"a: b"}');
    expect(splitResponse('{"a":1}')).toMatchObject({ status: null, body: '{"a":1}' });
  });
});

describe('BT50 through a stand-in gh', () => {
  const refusalOf = (action: () => unknown): BountyRefused => {
    try { action(); }
    catch (error) { if (error instanceof BountyRefused) return error; throw error; }
    throw new Error('expected a refusal');
  };
  const onEndpoint = (calls: string[][], endpoint: string) => calls.filter(call => call.includes(endpoint)).length;
  const RATE = { stdout: headers('HTTP/2.0 403 Forbidden', 'X-Ratelimit-Remaining: 0', `X-Ratelimit-Reset: ${RESET}`), stderr: `gh: API rate limit exceeded (HTTP 403) ${planted}` };
  const DOWN = { stdout: headers('HTTP/2.0 502 Bad Gateway'), stderr: `gh: HTTP 502 ${planted}` };

  it('a rate-limited read names the reset time and is not retried', () => fixture(({ repo, update, state }) => {
    update({ ghFailure: { on: 'repos/x/limited', ...RATE } });
    const refusal = refusalOf(() => api(repo, 'repos/x/limited'));
    expect(refusal.reason).toBe('github-rate-limited');
    expect(refusal.message).toContain(RESET_TIME);
    expect(refusal.message).not.toContain(leakCanary);
    expect(onEndpoint(state().calls, 'repos/x/limited')).toBe(1);
  }));

  it('a limit whose response gives no time reads /rate_limit', () => fixture(({ repo, update, state }) => {
    update({ ghFailure: { on: 'repos/x/limited', stderr: 'API rate limit exceeded (HTTP 403)' }, rateLimitReset: RESET });
    expect(refusalOf(() => api(repo, 'repos/x/limited')).message).toContain(RESET_TIME);
    expect(onEndpoint(state().calls, 'rate_limit')).toBe(1);
  }));

  it('the same failure on a POST is not retried, rate limit or server error', () => fixture(({ repo, update, state }) => {
    for (const failure of [RATE, DOWN]) {
      const before = onEndpoint(state().calls, 'repos/x/write');
      update({ ghFailure: { on: 'repos/x/write', ...failure } });
      refusalOf(() => api(repo, 'repos/x/write', { title: 'x' }));
      expect(onEndpoint(state().calls, 'repos/x/write') - before).toBe(1);
    }
  }));

  it('a read that fails twice ends in the named refusal after one bounded retry', () => fixture(({ repo, update, state }) => {
    update({ ghFailure: { on: 'repos/x/down', ...DOWN } });
    const started = Date.now();
    expect(refusalOf(() => api(repo, 'repos/x/down')).reason).toBe('github-unavailable');
    expect(onEndpoint(state().calls, 'repos/x/down')).toBe(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  }));

  it('a read that fails once is answered by its retry', () => fixture(({ repo, update, state, id }) => {
    const issue = { number: 7, html_url: 'https://github.com/owner/project/issues/7', title: id, body: '', state: 'open', user: { login: state().account } };
    update({ issues: [issue], ghFailure: { on: 'issues/7', ...DOWN, times: 1 } });
    expect(api(repo, `repos/${state().repository}/issues/7`)).toMatchObject({ number: 7 });
    expect(onEndpoint(state().calls, `repos/${state().repository}/issues/7`)).toBe(2);
  }));

  it('the retry spends the run\'s budget and never extends it', () => fixture(({ repo, update, state }) => {
    update({ ghFailure: { on: 'repos/x/down', ...DOWN } });
    limitGitHubCalls(60000, 2);
    try {
      // One call for the version probe at most, one for the read: nothing left to retry on.
      const refusal = refusalOf(() => api(repo, 'repos/x/down'));
      expect(['github-unavailable', 'github-call-budget']).toContain(refusal.reason);
      expect(onEndpoint(state().calls, 'repos/x/down')).toBeLessThanOrEqual(2);
      expect(refusalOf(() => api(repo, 'repos/x/down')).reason).toBe('github-call-budget');
    } finally { limitGitHubCalls(60000); }
  }));

  it('a rate limit mid-pagination stops with one refusal, not a partial list', () => fixture(({ repo, update }) => {
    update({ prs: [], ghFailure: { on: 'page=1', ...RATE } });
    expect(refusalOf(() => pages(repo, 'repos/x/list')).reason).toBe('github-rate-limited');
  }));

  it('a real 404 on the label still means the label is missing: it is created and the post goes out',() => fixture(({ repo, id, update, state }) => {
    update({ ghFailure: { on: '/labels/box-bounty', stdout: headers('HTTP/2.0 404 Not Found'), stderr: 'gh: Not Found (HTTP 404)' } });
    expect(postBounty(repo, id).record.stage).toBe('posted');
    expect(state().labels.map(label => label.name)).toContain('box-bounty');
  }));

  it('a rate limit at the issue create names the cause inside the incomplete post', () => fixture(({ repo, id, update, state }) => {
    update({ ghFailure: { on: '/labels', ...RATE } });
    const refusal = refusalOf(() => postBounty(repo, id));
    expect(refusal.reason).toBe('github-post-incomplete');
    expect(refusal.message).toContain('github-rate-limited');
    expect(refusal.message).toContain(RESET_TIME);
    expect(refusal.message).toContain(`next: retry omakase-box post ${id}`);
    expect(refusal.message).not.toContain(leakCanary);
    expect(JSON.stringify(loadRecord(repo, id))).not.toContain(leakCanary);
    expect(state().issues).toEqual([]);
  }));

  it('the repository read keeps its hard stop on an unnamed failure and names a rate limit', () => fixture(({ repo, id, update, state }) => {
    update({ fail: `repos/${state().repository}` });
    expect(refusalOf(() => postBounty(repo, id)).reason).toBe('github-visibility-unreadable');
    update({ fail: undefined, ghFailure: { on: `repos/${state().repository}`, ...RATE } });
    expect(refusalOf(() => postBounty(repo, id)).reason).toBe('github-rate-limited');
    expect(state().issues).toEqual([]);
  }));
});
