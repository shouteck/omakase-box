import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = '/repos/owner/project';
const missing = { status: 404 };
const ok = (json: unknown) => ({ status: 200, json });
type Issue = { number: number; state: string; user: { login: string } };
type Pull = { number: number; state: string; head: { sha: string }; base: { ref: string; repo?: { full_name: string } }; merge_commit_sha?: string; user: { login: string }; merged_at?: string; created_at: string; updated_at: string };
type ReplayState = { issues: Issue[]; prs: Pull[] };

export type ReplayReads = ReturnType<typeof replayReads>;

export function replayReads(directory: string) {
  const state = (): ReplayState => {
    try { return JSON.parse(readFileSync(join(directory, 'state.json'), 'utf8')) as ReplayState; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { issues: [], prs: [] };
      throw error;
    }
  };
  const git = (...args: string[]) => spawnSync('git', ['--git-dir', join(directory, 'remote.git'), ...args], { encoding: 'utf8', windowsHide: true });
  const onBranch = (sha: string, branch: string) => git('merge-base', '--is-ancestor', sha, `refs/heads/${branch}`).status === 0;
  const issues = () => state().issues.map(issue => ({ ...issue, repository_url: `https://api.github.com${REPO}`, author_association: issue.user.login === REPO.split('/')[2] ? 'OWNER' : 'NONE', user: { ...issue.user, id: 1 } }));
  const answer = (path: string, query: URLSearchParams): { status: number; json?: unknown } | undefined => {
    if (path === REPO) return ok({ full_name: 'owner/project', visibility: 'public', private: false, language: null, default_branch: 'main' });
    if (!path.startsWith(`${REPO}/`)) return undefined;
    const route = path.slice(REPO.length + 1);
    const issueNumber = /^issues\/(\d+)$/.exec(route)?.[1];
    if (issueNumber !== undefined) {
      const issue = issues().find(entry => entry.number === Number(issueNumber));
      return issue === undefined ? missing : ok(issue);
    }
    const pull = (pr: Pull) => {
      const merged = pr.merged_at ?? (onBranch(pr.head.sha, pr.base.ref) ? pr.updated_at : null);
      return { ...pr, merged_at: merged, state: merged === null ? pr.state : 'closed', user: { ...pr.user, id: 2 }, author_association: 'NONE' };
    };
    if (route === 'pulls') return ok(state().prs.filter(pr => pr.base.ref === query.get('base')).map(pull));
    const pullNumber = /^pulls\/(\d+)$/.exec(route)?.[1];
    if (pullNumber !== undefined) {
      const pr = state().prs.find(entry => entry.number === Number(pullNumber));
      if (pr === undefined) return missing;
      const shown = pull(pr);
      return ok({ ...shown, merged: shown.merged_at !== null, merge_commit_sha: pr.merge_commit_sha ?? null, base: { ...pr.base, repo: { full_name: 'owner/project' } } });
    }
    const compare = /^compare\/([a-f\d]{40})\.\.\.main$/.exec(route);
    if (compare !== null) return ok({ status: onBranch(compare[1]!, 'main') ? 'ahead' : 'diverged' });
    if (route === 'commits') {
      const ref = query.get('sha') ?? '';
      if (!/^refs\/box-bounty(?:-records)?\/bt-[a-f\d]{12}$/.test(ref)) return missing;
      const commits = git('rev-list', '--max-count=50', ref);
      return commits.status === 0 ? ok(commits.stdout.trim().split('\n').map(sha => ({ sha }))) : missing;
    }
    if (route === 'contents/event.json') {
      const ref = query.get('ref') ?? '';
      if (!/^[a-f\d]{40}$/.test(ref)) return missing;
      const event = git('show', `${ref}:event.json`);
      return event.status === 0 ? ok({ content: Buffer.from(event.stdout).toString('base64') }) : missing;
    }
    return missing;
  };
  return { answer, issues };
}
