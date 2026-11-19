import { invalid, remoteUrl } from './gh.js';
import { GitFailed, gitOutcome, gitStdin } from './git.js';
import type { NeverShipRule } from './never-ship.js';
import { showPath } from './notice.js';

// BT69: the second never-ship check, at the publication sink. The planner's
// `github-never-ship` judged a plan; this reads the objects a push of `commit`
// would actually send, as Git counts them: every commit reachable from it and
// from no object the destination advertises now. Each such commit's paths
// against its first parent (a root against the empty tree) meet the never-ship
// rules read at the sink. Merge side histories are walked commit by commit, so
// a path planted and then dropped is still seen. A read that fails refuses;
// nothing read is never taken to mean nothing outbound.
const SHA = /^[a-f\d]{40}$/;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

const unread = (what: string): never => invalid('github-git-failed', `Git could not read ${what} for the never-ship check before publishing; nothing was pushed or posted; next: check signed-in Git and rerun the same command`);

// Returns the checked SHA — the one object the caller may push.
export function checkOutbound(root: string, repository: string, commit: string, rules: readonly NeverShipRule[], id: string): string {
  const pinned = gitOutcome(root, ['rev-parse', '--verify', '--end-of-options', `${commit}^{commit}`]);
  if (!SHA.test(commit) || pinned.status !== 0 || pinned.error !== undefined || pinned.stdout.trim() !== commit) return unread(`the commit to publish (${commit.slice(0, 12)})`);
  const advertised = gitOutcome(root, ['ls-remote', remoteUrl(repository)]);
  if (advertised.status !== 0 || advertised.error !== undefined) return unread(`what ${repository} has on GitHub`);
  const remote = [...new Set(advertised.stdout.split('\n').map(line => line.split('\t')[0]!.trim()).filter(sha => SHA.test(sha)))];
  let walk: string;
  try {
    walk = gitStdin(root, ['rev-list', '--stdin', '--ignore-missing', '--parents'], `${commit}\n${remote.map(sha => `^${sha}`).join('\n')}\n`);
  } catch (error) {
    if (error instanceof GitFailed) return unread('the commits being published');
    throw error;
  }
  const hits = new Map<string, string>();
  for (const line of walk.split('\n')) {
    const [each, parent] = line.trim().split(/\s+/);
    if (each === undefined || !SHA.test(each)) continue;
    const diff = gitOutcome(root, ['diff-tree', '-r', '-z', '--no-renames', '--name-only', parent ?? EMPTY_TREE, each]);
    if (diff.status !== 0 || diff.error !== undefined) return unread(`commit ${each.slice(0, 12)}`);
    for (const path of diff.stdout.split('\0')) {
      if (path === '' || hits.has(path)) continue;
      const rule = rules.find(candidate => candidate.match(path.toLowerCase()));
      if (rule !== undefined) hits.set(path, rule.name);
    }
  }
  if (hits.size > 0) {
    const named = [...hits].map(([path, rule]) => `${showPath(path)} (${rule})`).join(', ');
    return invalid('github-publish-never-ship', `a commit about to be published for the first time touches a never-ship path under the current rules: ${named}; nothing was pushed or posted; next: take those paths out of the unpublished history, then close it with omakase-box close ${id} and post again`);
  }
  return commit;
}
