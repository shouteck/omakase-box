import { invalid, remoteUrl } from './gh.js';
import { GitFailed, gitOutcome, gitStdin } from './git.js';
import type { NeverShipRule } from './never-ship.js';
import { showPath } from './notice.js';

// BT69: the second never-ship check, at the publication sink. The planner's
// `github-never-ship` judged a plan; this reads the objects a push of `commit`
// would actually send, as Git counts them: every commit reachable from it and
// from no object the destination advertises now. Each such commit's paths
// against its first parent (a root against the empty tree), in one read, meet the never-ship
// rules read at the sink. Merge side histories are walked commit by commit, so
// a path planted and then dropped is still seen. A read that fails refuses;
// nothing read is never taken to mean nothing outbound.
const SHA = /^[a-f\d]{40}$/;

const unread = (what: string): never => invalid('github-git-failed', `Git could not read ${what} for the never-ship check before publishing; nothing was pushed or posted; next: check signed-in Git and rerun the same command`);

// Returns the checked SHA — the one object the caller may push.
export function checkOutbound(root: string, repository: string, commit: string, rules: readonly NeverShipRule[], id: string): string {
  if (!SHA.test(commit)) return unread(`the commit to publish (${commit.slice(0, 12)})`);
  const advertised = gitOutcome(root, ['ls-remote', remoteUrl(repository)]);
  if (advertised.status !== 0 || advertised.error !== undefined) return unread(`what ${repository} has on GitHub`);
  const remote = [...new Set(advertised.stdout.split('\n').map(line => line.split('\t')[0]!.trim()).filter(sha => SHA.test(sha)))];
  // One batch read pins the commit and finds which advertised commits this
  // repository holds: only those can bound what a push sends, as in Git's own
  // negotiation. An advertised object held here that is not a commit (a tag's
  // own object; its peeled commit is advertised too) bounds nothing.
  let kinds: string[];
  try {
    kinds = gitStdin(root, ['cat-file', '--batch-check'], [commit, ...remote].join('\n') + '\n').split('\n');
  } catch (error) {
    if (error instanceof GitFailed) return unread('the objects being published');
    throw error;
  }
  if (kinds[0]?.startsWith(`${commit} commit `) !== true) return unread(`the commit to publish (${commit.slice(0, 12)})`);
  const bounds = remote.filter((sha, index) => kinds[index + 1]?.startsWith(`${sha} commit `) === true);
  let walk: string;
  try {
    walk = gitStdin(root, ['rev-list', '--stdin', '--parents'], `${commit}\n${bounds.map(sha => `^${sha}`).join('\n')}\n`);
  } catch (error) {
    if (error instanceof GitFailed) return unread('the commits being published');
    throw error;
  }
  // One diff-tree reads every outbound commit against its first parent; a
  // root, alone on its line, against the empty tree.
  const pairs = walk.split('\n').map(line => line.trim().split(/\s+/).slice(0, 2)).filter(([each]) => each !== undefined && SHA.test(each));
  let paths = '';
  if (pairs.length > 0) {
    try {
      paths = gitStdin(root, ['diff-tree', '--stdin', '-r', '-z', '--no-renames', '--name-only', '--no-commit-id', '--root'], pairs.map(pair => pair.join(' ')).join('\n') + '\n');
    } catch (error) {
      if (error instanceof GitFailed) return unread('the paths the outbound commits change');
      throw error;
    }
  }
  const hits = new Map<string, string>();
  for (const path of paths.split('\0')) {
    if (path === '' || hits.has(path)) continue;
    const rule = rules.find(candidate => candidate.match(path.toLowerCase()));
    if (rule !== undefined) hits.set(path, rule.name);
  }
  if (hits.size > 0) {
    const named = [...hits].map(([path, rule]) => `${showPath(path)} (${rule})`).join(', ');
    return invalid('github-publish-never-ship', `a commit about to be published for the first time touches a never-ship path under the current rules: ${named}; nothing was pushed or posted; next: take those paths out of the unpublished history, then close it with omakase-box close ${id} and post again`);
  }
  return commit;
}
