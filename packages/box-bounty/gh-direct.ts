// BT59: GitHub's API over HTTPS with a token, for an agent that has a token and no `gh` program. It takes the arguments the
// tool gives `gh api` and answers exactly as `gh api --include` does — the status line, the headers, a blank line, the body —
// so the reading and the failure classifier in gh.ts are the same on both transports (BT50).
//
// The request runs in a child (`node -e`, synchronous like every caller expects), the shape of board.ts's call:
// - the child's environment is empty (SYSTEMROOT alone on Windows), so no proxy, GH_HOST or other variable can steer it;
// - the token travels only on the child's standard input, never in an argument;
// - only https://api.github.com is ever asked; a redirect is answered as it came and never followed;
// - the child's standard error is never read: it can carry request details.
// A test may point it at a local stand-in through BOX_BOUNTY_GITHUB_API_FOR_TESTS, honoured only when the value is exactly
// http://127.0.0.1:<port>; any other value is ignored.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { GitHubAnswer } from './gh.js';

const API = 'https://api.github.com';
const TEST_BASE = /^http:\/\/127\.0\.0\.1:\d{1,5}$/;
export const apiBase = (env: NodeJS.ProcessEnv = process.env): string => {
  const base = env['BOX_BOUNTY_GITHUB_API_FOR_TESTS'];
  return base !== undefined && TEST_BASE.test(base) ? base : API;
};

const CHILD = `
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', async () => {
  const call = JSON.parse(input);
  try {
    const answer = await fetch(call.url, {
      method: call.method, redirect: 'manual', signal: AbortSignal.timeout(call.timeout),
      headers: { authorization: 'Bearer ' + call.token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
        'user-agent': 'omakase-box', ...(call.body === null ? {} : { 'content-type': 'application/json' }) },
      ...(call.body === null ? {} : { body: call.body })
    });
    const body = await answer.text();
    let head = 'HTTP/1.1 ' + answer.status + '\\r\\n';
    answer.headers.forEach((value, name) => { head += name + ': ' + value + '\\r\\n'; });
    process.stdout.write(head + '\\r\\n' + body);
    process.exitCode = answer.status >= 200 && answer.status < 300 ? 0 : 1;
  } catch (error) {
    process.exitCode = 2;
  }
});
`;

/** The `gh api` arguments as one request: GET unless a payload rides `--input` (then `--method`, POST by default). */
export function requestOf(args: readonly string[], base = apiBase()): { readonly url: string; readonly method: string; readonly body: string | null } | null {
  // `gh auth status` is gh's own sign-in check; with a token the same question is GitHub's `user`.
  if (args[0] === 'auth' && args[1] === 'status') return { url: `${base}/user`, method: 'GET', body: null };
  if (args[0] !== 'api') return null;
  const valueFlags = new Set(['--hostname', '--method', '--input']);
  let endpoint: string | undefined;
  for (let i = 1; i < args.length; i += 1) {
    if (valueFlags.has(args[i]!)) { i += 1; continue; }
    if (!args[i]!.startsWith('-')) { endpoint = args[i]; break; }
  }
  if (endpoint === undefined) return null;
  const at = (flag: string): string | undefined => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
  const input = at('--input');
  const body = input === undefined ? null : readFileSync(input, 'utf8');
  const url = `${base}/${endpoint.replace(/^\/+/, '')}`;
  // The address must still be the API's after the endpoint is joined: no scheme, no authority, no climbing out.
  const parsed = new URL(url);
  if (parsed.origin !== new URL(base).origin || /(^|\/)\.\.(\/|$)/.test(endpoint) || endpoint.includes('@') || endpoint.includes('://')) return null;
  return { url, method: at('--method') ?? (body === null ? 'GET' : 'POST'), body };
}

/** One request with the token, answered as `gh api --include` answers. A request the arguments do not make, or one for
    another host, is refused before anything is sent. */
export function directRequest(token: string, args: readonly string[], timeoutMs: number): GitHubAnswer {
  const request = requestOf(args);
  if (request === null) return { status: 1, stdout: '', stderr: 'not sent' };
  const run = spawnSync(process.execPath, ['-e', CHILD], {
    input: JSON.stringify({ ...request, token, timeout: timeoutMs }),
    encoding: 'utf8', timeout: timeoutMs + 1500, windowsHide: true, maxBuffer: 16 * 1024 * 1024,
    env: process.platform === 'win32' && process.env['SYSTEMROOT'] !== undefined ? { SYSTEMROOT: process.env['SYSTEMROOT'] } : {}
  });
  if (run.error !== undefined || run.status === 2 || run.status === null) return { status: null, stdout: '', stderr: '', error: run.error ?? new Error('GitHub could not be reached') };
  return { status: run.status, stdout: run.stdout, stderr: '' };
}
