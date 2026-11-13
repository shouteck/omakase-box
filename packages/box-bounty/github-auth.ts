// BT59: a GitHub token in the environment, for an agent that has one and no `gh` program. This module holds the one fact
// the rest of the tool asks — which token, if any, this process signs in to GitHub with — and how Git is given it for a call
// that reaches github.com. It imports nothing of gh.ts, so git.ts can ask it without a cycle.
//
// The token is read from GH_TOKEN, then GITHUB_TOKEN (the names gh itself reads). It is never written anywhere: not to an
// argument, a file, a record, the settings, the shared chain or any output. It travels to the API child on standard input
// (gh-direct.ts) and to Git in the environment of the one call that needs it, as BOX_BOUNTY_GIT_TOKEN.
import { BountyRefused } from './errors.js';
import { resolveProgram } from './program.js';

/** The token GH_TOKEN, then GITHUB_TOKEN, holds; null when neither holds one. A value with whitespace inside is refused by
    name rather than sent, since a token never holds any. The value is never put into the message. */
export function tokenFromEnvironment(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN'] as const) {
    const value = env[name]?.trim();
    if (value === undefined || value === '') continue;
    if (/\s/.test(value)) throw new BountyRefused('github-not-signed-in', `${name} holds whitespace inside it, so it is not a GitHub token; nothing was sent; next: set ${name} to the token alone, or sign in with gh auth login, then rerun the same command`);
    return value;
  }
  return null;
}

/** An environment for a child that must not see the token under its own names: Git, which never needs it there. */
export function withoutTokens(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept = { ...env };
  delete kept['GH_TOKEN'];
  delete kept['GITHUB_TOKEN'];
  return kept;
}

// The token this process chose for GitHub (set by gh.ts when the token transport is chosen), so later Git calls use it too.
let chosen: string | null = null;
export function useTokenForGit(token: string | null): void { chosen = token; }

/** Which way this process signs in to GitHub, once gh.ts has chosen; null before. */
let signIn: 'gh' | 'token' | null = null;
export function recordSignIn(way: 'gh' | 'token' | null): void { signIn = way; }
export const signedInWith = (): 'gh' | 'token' | null => signIn;

/** The token Git should use: the one already chosen, or, before any GitHub API call, the environment's when no gh is on
    PATH. With gh on PATH and nothing chosen yet, Git keeps its own sign-in. */
function tokenForGit(): string | null {
  if (chosen !== null) return chosen;
  try { resolveProgram('gh'); return null; } catch { /* no gh: the environment's token, if any */ }
  try { return tokenFromEnvironment(); } catch { return null; }
}

// Git's credential helper for github.com, given in the environment only (`git help config`: GIT_CONFIG_COUNT,
// GIT_CONFIG_KEY_<n>, GIT_CONFIG_VALUE_<n>; `git help credential`). The empty first value clears every helper configured
// elsewhere for the call, so no other helper is ever handed the token when Git approves it; the second answers `get` from
// the environment and ignores `store` and `erase`. Nothing reaches Git's arguments or any configuration file.
const HELPER = '!f() { test "$1" = get && printf \'username=x-access-token\\npassword=%s\\n\' "$BOX_BOUNTY_GIT_TOKEN"; }; f';
export const GITHUB_HTTPS = 'https://github.com/';

/** The environment a Git call adds when its arguments reach github.com over HTTPS and a token is in use; {} otherwise. */
export function gitCredentialEnvironment(args: readonly string[]): Record<string, string> {
  if (!args.some(arg => arg.startsWith(GITHUB_HTTPS))) return {};
  const token = tokenForGit();
  if (token === null) return {};
  return {
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'credential.https://github.com.helper', GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: 'credential.https://github.com.helper', GIT_CONFIG_VALUE_1: HELPER,
    GIT_TERMINAL_PROMPT: '0',
    BOX_BOUNTY_GIT_TOKEN: token
  };
}
