import { BountyRefused } from '../../box-bounty/errors.js';
import { type BountyFormat, readFormat } from '../../box-bounty/format.js';
import { AGENT_PREPARE_MARKER } from '../../box-bounty/issue.js';
import { BUILTIN_RULES, parseOwnerList } from '../../box-bounty/never-ship-paths.js';
import type { GitHub } from './github.js';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const SHA = /^[a-f\d]{40}$/;
export const MAX_PATHS = 2000;
export const treePath = (path: unknown): path is string => typeof path === 'string' && path.length > 0 && path.length <= 1024
  && !/[\\\x00-\x1f\x7f]/.test(path) && !/^[A-Za-z]:/.test(path) && path.split('/').every(part => part !== '' && part !== '.' && part !== '..');

export function refusedPaths(paths: readonly string[], boxignore: string): { path: string; rule: string }[] {
  const owner = parseOwnerList(boxignore);
  const rules = owner === null ? BUILTIN_RULES : [...BUILTIN_RULES, owner.rule];
  return paths.flatMap(path => {
    const rule = rules.find(candidate => candidate.match(path));
    return rule === undefined ? [] : [{ path, rule: rule.name }];
  });
}

export function preparedFormat(body: string, repository: string, reward: number): BountyFormat | null {
  const read = readFormat(body);
  if (read.kind !== 'present' || read.value.schemaVersion !== 2 || read.value.state.kind !== 'open'
    || read.value.repository.toLowerCase() !== repository.toLowerCase() || read.value.reward.amount !== reward
    || body.split(AGENT_PREPARE_MARKER).length !== 2 || !body.includes(`<!-- box-bounty:${read.value.id} -->`)) return null;
  return read.value;
}

export async function verifyAgentBranch(github: GitHub, repository: string, format: BountyFormat): Promise<string | null> {
  const head = await github.get(`/repos/${repository}/commits/${encodeURIComponent(format.branch)}`);
  if (head.status !== 200 || !record(head.json) || head.json['sha'] !== format.workCommit) return 'The bounty branch tip does not match workCommit. Next: push the prepared commit to its exact branch.';
  const commit = head.json['commit'];
  const tree = record(commit) ? commit['tree'] : null;
  if (!record(tree) || typeof tree['sha'] !== 'string' || !SHA.test(tree['sha'])) return 'GitHub did not return the branch tree. Next: try again later.';
  const answer = await github.get(`/repos/${repository}/git/trees/${tree['sha']}?recursive=1`);
  if (answer.status !== 200 || !record(answer.json) || answer.json['truncated'] !== false || !Array.isArray(answer.json['tree']) || answer.json['tree'].length > MAX_PATHS) return 'The branch tree is unreadable, truncated or exceeds 2000 paths. Next: prepare a smaller complete tree.';
  const paths: string[] = [];
  let ignoreSha: string | null = null;
  for (const entry of answer.json['tree'] as unknown[]) {
    if (!record(entry) || !treePath(entry['path']) || typeof entry['sha'] !== 'string' || !SHA.test(entry['sha'])) return 'GitHub returned an invalid tree entry. Next: check the branch tree.';
    const mode = entry['mode'];
    if (!((entry['type'] === 'tree' && mode === '040000') || (entry['type'] === 'blob' && (mode === '100644' || mode === '100755')))) return 'The branch contains a symlink, submodule or unsupported mode. Next: remove non-plain entries before preparing again.';
    paths.push(entry['path']);
    if (entry['path'] === '.boxignore') {
      if (entry['type'] !== 'blob') return 'The root .boxignore is not a file. Next: replace it with a plain text file.';
      ignoreSha = entry['sha'];
    }
  }
  let boxignore = '';
  if (ignoreSha !== null) {
    const blob = await github.get(`/repos/${repository}/git/blobs/${ignoreSha}`);
    if (blob.status !== 200 || !record(blob.json) || blob.json['encoding'] !== 'base64' || typeof blob.json['content'] !== 'string' || blob.json['content'].length > 90000) return 'The root .boxignore could not be read. Next: use a text file of at most 64 KiB.';
    try {
      const bytes = Uint8Array.from(atob(blob.json['content'].replace(/\s/g, '')), c => c.charCodeAt(0));
      if (bytes.byteLength > 65536) return 'The root .boxignore exceeds 64 KiB. Next: shorten it.';
      boxignore = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch { return 'The root .boxignore is not valid UTF-8 text. Next: fix the file.'; }
  }
  try {
    const refused = refusedPaths(paths, boxignore);
    return refused.length === 0 ? null : `The branch contains never-ship paths: ${refused.map(hit => JSON.stringify(hit.path)).join(', ')}. Next: remove them and prepare again.`;
  } catch (error) {
    if (error instanceof BountyRefused) return `${error.message}. Next: fix the branch's .boxignore.`;
    throw error;
  }
}
