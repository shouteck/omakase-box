// BT59: the tool works with a GitHub token alone; gh is one way to sign in, not a requirement. With gh on PATH and no token
// nothing changes. Without gh, GH_TOKEN (then GITHUB_TOKEN) is enough: API calls go over HTTPS from a child given the token
// on standard input and no environment, and a Git call to github.com gets the token as its credential helper's answer, in
// its environment only. The rows follow the brief's table; MARK is a made-up token.
import childProcess, { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyBounty, closeBounty, listGitHubAnswers, loadRecord, postBounty, renderStatus } from '../../../packages/box-bounty/index.js';
import { apiBase, requestOf } from '../../../packages/box-bounty/gh-direct.js';
import { chooseTransport, signedAccount, useGitHubTransportForTests } from '../../../packages/box-bounty/gh.js';
import { gitCredentialEnvironment, tokenFromEnvironment, useTokenForGit, recordSignIn } from '../../../packages/box-bounty/github-auth.js';
import { closeStores } from '../../../packages/box-bounty/store.js';
import { resolveProgram } from '../../../packages/box-bounty/program.js';
import { fixture, refused, STANDIN, type GithubFixture } from './github-fixture.js';
import { inProcessGh } from './gh-inprocess.js';
import { git, makeRepo, runRoot } from './support.js';

const MARK = ['ghp', 'bt59marker000000000000000000000000'].join('_');
const SERVER = fileURLToPath(new URL('./api-standin.cjs', import.meta.url));
let folder: string;
let base: string;
let server: ChildProcess;

beforeAll(async () => {
  folder = runRoot('bt59-api');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'config.json'), '{}');
  server = spawn(process.execPath, [SERVER, folder], { stdio: ['ignore', 'pipe', 'inherit'] });
  base = await new Promise<string>(done => server.stdout!.once('data', chunk => done(`http://127.0.0.1:${/listening (\d+)/.exec(String(chunk))![1]}`)));
});
afterAll(() => { server.kill(); });

interface Seen { readonly method: string; readonly path: string; readonly authorization: string | null }
const requests = (): Seen[] => {
  const file = join(folder, 'requests.jsonl');
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as Seen) : [];
};
const serve = (ctx: GithubFixture, extra: Record<string, unknown> = {}) => {
  writeFileSync(join(folder, 'requests.jsonl'), '');
  writeFileSync(join(folder, 'config.json'), JSON.stringify({ standin: join(ctx.bin, 'standin.cjs'), state: join(ctx.scratch, 'state.json'), bare: ctx.bare, remoteUrl: 'https://github.com/owner/project.git', ...extra }));
};

/** Run with these environment values set (undefined removes one), restored after; the sign-in choice is forgotten both ways. */
function withEnv<T>(values: Record<string, string | undefined>, run: () => T): T {
  const before = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  useTokenForGit(null); recordSignIn(null);
  try { return run(); }
  finally {
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    useTokenForGit(null); recordSignIn(null);
  }
}
const token = (name: 'GH_TOKEN' | 'GITHUB_TOKEN' = 'GH_TOKEN') => ({ [name]: MARK, BOX_BOUNTY_GITHUB_API_FOR_TESTS: base });

/**
 * The PATH as it is, less any gh program (the stand-in's and any real one): Git, sh and Node stay. A folder that holds gh is
 * left out on Windows, where gh has a folder of its own; on Linux and macOS gh sits in /usr/bin beside git and sh, so such a
 * folder is replaced by a shadow holding a link to everything in it except gh.
 */
const GH_NAMES = new Set(['gh', 'gh.exe', 'gh.cmd', 'gh.bat']);
const shadows = new Map<string, string>();
const shadowOf = (dir: string): string => {
  const known = shadows.get(dir);
  if (known !== undefined) return known;
  const shadow = runRoot('bt59-path-shadow');
  for (const name of readdirSync(dir)) if (!GH_NAMES.has(name)) { try { symlinkSync(join(dir, name), join(shadow, name)); } catch { /* an entry that cannot be linked is not needed */ } }
  shadows.set(dir, shadow);
  return shadow;
};
function withoutGh(run: () => void): void {
  const before = process.env.PATH;
  const hasGh = (dir: string) => [...GH_NAMES].some(name => existsSync(join(dir, name)));
  process.env.PATH = (before ?? '').split(delimiter).filter(dir => dir !== '')
    .flatMap(dir => !hasGh(dir) ? [dir] : process.platform === 'win32' ? [] : [shadowOf(dir)]).join(delimiter);
  try { expect(() => resolveProgram('gh')).toThrow(); run(); }
  finally { process.env.PATH = before; }
}

/** Every child the tool starts during `run`: the program, its arguments, its environment and its standard input. */
function spawned<T>(run: () => T): { readonly result: T; readonly children: { program: string; args: string[]; env: NodeJS.ProcessEnv; input: string }[] } {
  const children: { program: string; args: string[]; env: NodeJS.ProcessEnv; input: string }[] = [];
  const inner = childProcess.spawnSync;
  childProcess.spawnSync = new Proxy(inner, {
    apply(target, receiver, args) {
      const options = (args[2] ?? {}) as { env?: NodeJS.ProcessEnv; input?: unknown };
      children.push({ program: String(args[0]), args: Array.isArray(args[1]) ? args[1].map(String) : [], env: options.env ?? process.env, input: typeof options.input === 'string' ? options.input : '' });
      return Reflect.apply(target, receiver, args);
    }
  });
  syncBuiltinESMExports();
  try { return { result: run(), children }; }
  finally { childProcess.spawnSync = inner; syncBuiltinESMExports(); }
}

/** Every byte the tool keeps for this repository and its shared memory: the record store, the settings, the chain refs. */
function storedText(ctx: GithubFixture): string {
  closeStores();
  const files: string[] = [];
  const walk = (dir: string) => { if (!existsSync(dir)) return; for (const name of readdirSync(dir)) { const full = join(dir, name); if (statSync(full).isDirectory()) walk(full); else files.push(full); } };
  walk(join(ctx.repo, '.box'));
  walk(join(ctx.scratch, 'settings'));
  const chain = git(ctx.bare, ['for-each-ref', '--format=%(objectname)', 'refs/box-bounty-records/']).split('\n').filter(Boolean);
  const events = chain.flatMap(sha => git(ctx.bare, ['log', '--format=%H', sha]).split('\n').filter(Boolean)).map(sha => spawnSync('git', ['-C', ctx.bare, 'show', `${sha}:event.json`], { encoding: 'utf8' }).stdout ?? '');
  return [...files.map(file => readFileSync(file).toString('latin1')), ...events, readFileSync(join(ctx.repo, '.git', 'config'), 'utf8')].join('\n');
}

describe('BT59: the way in, as data', () => {
  // @guards PL1
  it('gh signed in wins; no gh means the token; gh signed out with a token means the token; neither is no way in', () => {
    const yes = () => true;
    const no = () => false;
    const rows: [boolean, string | null, () => boolean, string][] = [
      [true, null, no, 'gh'], [true, null, yes, 'gh'], [true, MARK, yes, 'gh'], [true, MARK, no, 'token'], [false, MARK, yes, 'token'], [false, null, yes, 'none']
    ];
    for (const [ghOnPath, tokenValue, ghSignedIn, want] of rows) expect(chooseTransport({ ghOnPath, token: tokenValue, ghSignedIn }), JSON.stringify([ghOnPath, tokenValue !== null])).toBe(want);
    let asked = 0;
    chooseTransport({ ghOnPath: true, token: null, ghSignedIn: () => { asked += 1; return true; } });
    expect(asked, 'gh with no token pays no sign-in check: the gh path starts what it started before').toBe(0);
  });

  // @guards PL7
  it('the token comes from GH_TOKEN, then GITHUB_TOKEN; whitespace inside is refused by name and never echoed', () => {
    expect(tokenFromEnvironment({ GH_TOKEN: ' a ', GITHUB_TOKEN: 'b' })).toBe('a');
    expect(tokenFromEnvironment({ GITHUB_TOKEN: 'b' })).toBe('b');
    expect(tokenFromEnvironment({ GH_TOKEN: '', GITHUB_TOKEN: '' })).toBeNull();
    let message = '';
    try { tokenFromEnvironment({ GH_TOKEN: `${MARK}\nX-Evil: 1` }); } catch (error) { message = String((error as Error).message); expect((error as { reason?: string }).reason).toBe('github-not-signed-in'); }
    expect(message).toContain('GH_TOKEN holds whitespace');
    expect(message).not.toContain(MARK);
  });

  // @guards PL7
  it('only the API is ever asked: a test address only when it is exactly http://127.0.0.1:<port>, and no endpoint climbs out', () => {
    expect(apiBase({})).toBe('https://api.github.com');
    expect(apiBase({ BOX_BOUNTY_GITHUB_API_FOR_TESTS: 'http://127.0.0.1:4000' })).toBe('http://127.0.0.1:4000');
    for (const other of ['https://evil.example', 'http://localhost:4000', 'http://127.0.0.1:4000/x', 'http://127.0.0.1.evil:4000']) expect(apiBase({ BOX_BOUNTY_GITHUB_API_FOR_TESTS: other }), other).toBe('https://api.github.com');
    expect(requestOf(['api', '--hostname', 'github.com', 'repos/o/r', '--include'])).toEqual({ url: 'https://api.github.com/repos/o/r', method: 'GET', body: null });
    expect(requestOf(['auth', 'status', '--hostname', 'github.com'])?.url).toBe('https://api.github.com/user');
    const input = join(runRoot('bt59-input'), 'q.json');
    writeFileSync(input, '{"query":"q"}');
    expect(requestOf(['api', '--hostname', 'github.com', 'graphql', '--include', '--method', 'POST', '--input', input])).toEqual({ url: 'https://api.github.com/graphql', method: 'POST', body: '{"query":"q"}' });
    for (const bad of ['../../evil', 'repos/../../x', 'https://evil.example/x', 'user@evil.example']) expect(requestOf(['api', '--hostname', 'github.com', bad, '--include']), bad).toBeNull();
    expect(requestOf(['version'])).toBeNull();
  });
});

describe('BT59: Git gets the token in its environment, for github.com only', () => {
  // @guards PL7
  it('git credential fill answers the token from the environment, and no helper the repository names is asked', () => {
    const repo = makeRepo({ 'x.txt': 'x\n' });
    // A helper configured elsewhere that would answer, and would be handed the token on approve: it must never run.
    const trap = join(repo, 'trap.txt');
    git(repo, ['config', 'credential.helper', `!f() { echo used > "${trap.replaceAll('\\', '/')}"; echo password=WRONG; }; f`]);
    useTokenForGit(MARK);
    try {
      const env = gitCredentialEnvironment(['push', 'https://github.com/o/r.git']);
      expect(Object.keys(env).sort()).toEqual(['BOX_BOUNTY_GIT_TOKEN', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_KEY_1', 'GIT_CONFIG_VALUE_0', 'GIT_CONFIG_VALUE_1', 'GIT_TERMINAL_PROMPT']);
      expect(Object.entries(env).filter(([key]) => key !== 'BOX_BOUNTY_GIT_TOKEN').some(([, value]) => value.includes(MARK)), 'the token rides one variable only').toBe(false);
      const filled = spawnSync('git', ['-C', repo, 'credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', env: { ...process.env, ...env } });
      expect(filled.status, filled.stderr).toBe(0);
      expect(filled.stdout).toContain(`password=${MARK}`);
      expect(filled.stdout).toContain('username=x-access-token');
      expect(existsSync(trap), 'the repository\'s own helper was not asked').toBe(false);
      expect(gitCredentialEnvironment(['fetch', 'https://gitlab.com/o/r.git']), 'another host gets nothing').toEqual({});
      expect(gitCredentialEnvironment(['status']), 'a local call gets nothing').toEqual({});
    } finally { useTokenForGit(null); }
    expect(gitCredentialEnvironment(['push', 'https://github.com/o/r.git']), 'no token in use, nothing added').toEqual({});
  });
});

describe('BT59: the token on a real journey, against the stand-ins', { timeout: 300000 }, () => {
  // Row 1. @guards PL1
  it('gh present and signed in, a token also set: gh is used and the API stand-in is asked nothing', () => fixture(ctx => {
    serve(ctx);
    withEnv(token(), () => { postBounty(ctx.repo, ctx.id, 'github'); });
    expect(requests()).toEqual([]);
    expect(loadRecord(ctx.repo, ctx.id).github?.state).toBe('posted');
  }));

  // Rows 2, 6, 7, 8. @guards PL7
  it('no gh, GH_TOKEN set: post, status, apply and close work; the token is sent as a bearer only to the API, and is in no argument, record, setting, chain event, output or config', () => fixture(ctx => {
    serve(ctx);
    const out: string[] = [];
    // Only the tool's own children are watched: the fixture's helper that opens the solver's pull request runs between.
    const first = spawned(() => withoutGh(() => withEnv(token(), () => { out.push(JSON.stringify(postBounty(ctx.repo, ctx.id, 'github').record)); })));
    ctx.pr();
    const second = spawned(() => withoutGh(() => withEnv(token(), () => {
      listGitHubAnswers(ctx.repo, ctx.id);
      out.push(renderStatus(ctx.repo, { full: true }));
      out.push(JSON.stringify(applyBounty(ctx.repo, ctx.id, 1)));
      out.push(renderStatus(ctx.repo, { full: true }));
    })));
    const printed = out.join('\n');
    const children = [...first.children, ...second.children];
    expect(loadRecord(ctx.repo, ctx.id).github?.state).toBe('closed');
    const seen = requests();
    expect(seen.length).toBeGreaterThan(3);
    expect(seen.every(request => request.authorization === `Bearer ${MARK}`), 'every request carries the bearer').toBe(true);
    // Row 6: the search finds a planted marker before it is trusted to find none.
    expect(`${storedText(ctx)}\n${MARK}`.includes(MARK)).toBe(true);
    expect(storedText(ctx).includes(MARK), 'the record store, the settings, the chain or .git/config holds the token').toBe(false);
    expect(printed.includes(MARK), 'what the commands printed or returned holds the token').toBe(false);
    // Row 7: in no argument list; in an environment only as BOX_BOUNTY_GIT_TOKEN of a Git call to github.com; on the API child's input.
    expect(children.filter(child => child.args.some(arg => arg.includes(MARK))), 'an argument list holds the token').toEqual([]);
    for (const child of children) {
      const carriers = Object.entries(child.env).filter(([, value]) => value?.includes(MARK)).map(([key]) => key);
      if (carriers.length === 0) continue;
      expect(carriers, `${child.program} ${child.args.slice(-3).join(' ')}`).toEqual(['BOX_BOUNTY_GIT_TOKEN']);
      expect(child.args.some(arg => arg.startsWith('https://github.com/')), 'only a Git call to github.com gets it').toBe(true);
    }
    const api = children.filter(child => child.args[0] === '-e' && child.input.includes('"token"'));
    expect(api.length).toBeGreaterThan(3);
    expect(api.every(child => Object.keys(child.env).every(key => key === 'SYSTEMROOT')), 'the API child gets no environment').toBe(true);
    // Row 8: no credential section was written.
    expect(readFileSync(join(ctx.repo, '.git', 'config'), 'utf8')).not.toMatch(/\[credential/);
  }));

  // Row 3.
  it('GITHUB_TOKEN alone is enough', () => fixture(ctx => {
    serve(ctx);
    withoutGh(() => withEnv({ ...token('GITHUB_TOKEN'), GH_TOKEN: undefined }, () => { expect(signedAccount(ctx.repo)).toBe('owner'); }));
    expect(requests().map(request => request.authorization)).toEqual([`Bearer ${MARK}`]);
  }));

  // Row 4. @guards PL1
  it('gh present but signed out, a token set: the token is used', () => fixture(ctx => {
    serve(ctx);
    ctx.update({ auth: false });
    withEnv(token(), () => { postBounty(ctx.repo, ctx.id, 'github'); });
    expect(loadRecord(ctx.repo, ctx.id).github?.state).toBe('posted');
    expect(requests().length).toBeGreaterThan(0);
  }));

  // Row 5. @guards PL1
  it('neither gh nor a token: one refusal naming both ways in; nothing sent, nothing posted', () => fixture(ctx => {
    serve(ctx);
    withoutGh(() => withEnv({ GH_TOKEN: undefined, GITHUB_TOKEN: undefined }, () => {
      refused(() => postBounty(ctx.repo, ctx.id, 'github'), 'github-cli-missing');
      let message = '';
      try { postBounty(ctx.repo, ctx.id, 'github'); } catch (error) { message = String((error as Error).message); }
      expect(message).toContain('gh auth login');
      expect(message).toContain('GH_TOKEN');
    }));
    expect(requests()).toEqual([]);
    expect(loadRecord(ctx.repo, ctx.id).github ?? null).toBeNull();
  }));

  // Row 9. @guards PL7
  it('a redirect is refused and never followed: the address it names is asked nothing', () => fixture(ctx => {
    serve(ctx, { redirect: true });
    withoutGh(() => withEnv(token(), () => { refused(() => signedAccount(ctx.repo), 'github-command-failed'); }));
    expect(requests().map(request => request.path)).toEqual(['/user']);
  }));

  // Row 11.
  it('a rate limit and a server error say the same sentences on both transports', () => {
    const answers: Record<string, string[]> = { gh: [], token: [] };
    const reset = String(Math.floor(Date.parse('2030-01-01T00:00:00Z') / 1000));
    const cases = [
      { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }, gh: `HTTP/2.0 403 Forbidden\nX-Ratelimit-Remaining: 0\nX-Ratelimit-Reset: ${reset}\n\n{"message":"API rate limit exceeded"}` },
      { status: 502, headers: {}, gh: 'HTTP/2.0 502 Bad Gateway\n\n{}' }
    ];
    for (const each of cases) {
      fixture(ctx => {
        ctx.update({ ghFailure: { on: 'user', stdout: each.gh, exit: 1 } });
        try { signedAccount(ctx.repo); } catch (error) { answers['gh']!.push(String((error as Error).message)); }
      });
      fixture(ctx => {
        serve(ctx, { failure: { on: '/user', status: each.status, headers: each.headers, body: '{}' } });
        withoutGh(() => withEnv(token(), () => { try { signedAccount(ctx.repo); } catch (error) { answers['token']!.push(String((error as Error).message)); } }));
      });
    }
    expect(answers['token']).toEqual(answers['gh']);
    expect(answers['gh']).toHaveLength(2);
    expect(answers['gh']![0]).toContain('rate limit');
  });
});

describe('BT59: the in-process stand-in answers as the program does', { timeout: 300000 }, () => {
  /** A post and a pull-request listing; the stand-in's own record of the calls it was asked. */
  const journey = (inProcess: boolean) => {
    let calls: unknown[] = [];
    let ghStarts = 0;
    fixture(ctx => {
      if (inProcess) useGitHubTransportForTests(inProcessGh(STANDIN));
      try {
        const { children } = spawned(() => { postBounty(ctx.repo, ctx.id, 'github'); ctx.pr(); listGitHubAnswers(ctx.repo, ctx.id); });
        ghStarts = children.filter(child => /(^|[\\/])gh(\.exe|\.cmd)?$/i.test(child.program)).length;
      } finally { useGitHubTransportForTests(null); }
      // The version probe is the gh program's own (one per program per process); the stand-in answers every other call.
      // An --input file is a fresh temporary file per call: its name differs every run, its content is the request's.
      calls = ctx.state().calls.filter(call => !(Array.isArray(call) && call[0] === 'version'))
        .map(call => (call as string[]).map((arg, index, all) => all[index - 1] === '--input' ? '<input>' : arg));
    });
    return { calls, ghStarts };
  };

  it('the same calls, in the same order, with no gh process started in-process', () => {
    const program = journey(false);
    const inProcess = journey(true);
    expect(program.calls.length).toBeGreaterThan(3);
    expect(inProcess.calls).toEqual(program.calls);
    expect(program.ghStarts, 'the program path really starts gh').toBeGreaterThan(0);
    expect(inProcess.ghStarts, 'the in-process path starts none').toBe(0);
  });
});

describe('BT59: one journey, two transports, the same outcome', { timeout: 300000 }, () => {
  const normal = (text: string) => text.replace(/\b[0-9a-f]{40}\b/g, '<sha>').replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<time>').replace(/\b\d+ (?:seconds?|minutes?|hours?|days?) ago\b/g, '<age>');
  const run = (via: 'gh' | 'token') => {
    let out = '';
    fixture(ctx => {
      serve(ctx);
      const steps = () => {
        const lines: string[] = [];
        postBounty(ctx.repo, ctx.id, 'github');
        lines.push(renderStatus(ctx.repo, { full: true }));
        ctx.pr();
        listGitHubAnswers(ctx.repo, ctx.id);
        lines.push(renderStatus(ctx.repo, { full: true }));
        lines.push(JSON.stringify(applyBounty(ctx.repo, ctx.id, 1).outcome));
        lines.push(renderStatus(ctx.repo, { full: true }));
        const record = loadRecord(ctx.repo, ctx.id);
        lines.push(JSON.stringify({ stage: record.stage, github: { state: record.github?.state, issue: record.github?.issue, pending: record.github?.pending } }));
        return lines.join('\n---\n');
      };
      if (via === 'gh') out = steps();
      else withoutGh(() => { out = withEnv(token(), steps); });
      out = out.split(ctx.repo).join('<repo>'); // each fixture is its own scratch folder
    });
    return normal(out);
  };

  // Row 10.
  it('post, status, a solution, apply and close print and record the same through gh and through the token', () => {
    const viaToken = run('token');
    const viaGh = run('gh');
    expect(viaToken.length).toBeGreaterThan(200);
    expect(viaToken).toBe(viaGh);
  });

  it('close works on the token transport too', () => fixture(ctx => {
    serve(ctx);
    withoutGh(() => withEnv(token(), () => {
      postBounty(ctx.repo, ctx.id, 'github');
      closeBounty(ctx.repo, ctx.id, 'not needed any more');
    }));
    expect(loadRecord(ctx.repo, ctx.id).github?.state).toBe('closed');
  }));
});
