// BT61: a stranger's text keeps its boundary in every new document. Hostile strings (a quote, a newline, a control character, a
// bidi override and a forged-schema fragment) are put into every field a stranger can reach, in each document builder; each
// document must still round-trip through JSON unchanged, and the hostile text may appear only under a field the document's
// closing `foreignFields` list names, never in the tool's own fields (`schema`, `outcome`, `next`, ...).
import { describe, expect, it } from 'vitest';
import { applyDocument, closeAttemptDocument, closeDocument, createDocument, postPreviewDocument, takeDocument } from '../../../packages/box-bounty/json.js';
import type { BountyRecord } from '../../../packages/box-bounty/record.js';

const HOSTILE = 'x"\ny}\u0007‮{"schema":"forged@1"}';
const record = { id: 'bt-111111111111', stage: 'applied', title: 'A title' } as unknown as BountyRecord;

/** Every path in the document whose string value contains the hostile text, with array positions written `[]`. */
function hostilePaths(node: unknown, path = ''): string[] {
  if (typeof node === 'string') return node.includes('\u0007') ? [path] : [];
  if (Array.isArray(node)) return node.flatMap(item => hostilePaths(item, `${path}[]`));
  if (node !== null && typeof node === 'object') return Object.entries(node).flatMap(([key, value]) => hostilePaths(value, path === '' ? key : `${path}.${key}`));
  return [];
}

const documents: Record<string, Record<string, unknown>> = {
  create: createDocument(
    { id: 'bt-111111111111', plan: { repoRoot: '/tmp/repo', title: 'T', titleShortened: false, task: { file: 'TASK.md' }, scan: { hits: [{ path: HOSTILE, line: 1, rule: 'rule' }], binary: [HOSTILE] }, ruleRemovals: [{ rule: 'dot-box', removed: HOSTILE }] } },
    { record: '/tmp/r', reward: 0, waitsForOwner: null, next: 'omakase-box post bt-111111111111' }, [HOSTILE], []),
  'post-preview': postPreviewDocument('bt-111111111111',
    { repository: 'owner/project', title: 'T', body: HOSTILE, base: 'a'.repeat(40), head: 'b'.repeat(40), tip: 'c'.repeat(40), pushed: [{ sha: 'd'.repeat(40), subject: HOSTILE }], wip: { subject: HOSTILE }, include: [], withChanges: false, untracked: [HOSTILE] },
    [HOSTILE], []),
  apply: applyDocument(
    { outcome: 'conflict', record, attempt: 1, mergeCommit: null, conflicts: [HOSTILE], clean: [HOSTILE], commits: [HOSTILE], base: 'e'.repeat(40) },
    { notOnGitHub: null, pending: null, closedNote: null, payMessage: [HOSTILE], firstMergeNotice: null, job: 'A title', next: 'omakase-box look bt-111111111111 1' },
    [HOSTILE], []),
  close: closeDocument({ outcome: 'closed', record }, { reason: null, pay: [HOSTILE], pending: null, closedNote: null, job: 'A title' }, [HOSTILE], []),
  take: takeDocument({ kind: 'taken', lines: [HOSTILE], taken: { repository: 'owner/project', stage: 'taken', pullRequest: { number: 1, url: 'https://github.com/owner/project/pull/1' } } }, 'bt-111111111111', []),
  'close-attempt': closeAttemptDocument('bt-111111111111', HOSTILE, [])
};

describe('BT61: a stranger\'s text keeps its boundary in every new document', () => {
  for (const [name, document] of Object.entries(documents)) {
    it(`${name}: round-trips, and the hostile text is only under a declared foreign field`, () => {
      expect(JSON.parse(JSON.stringify(document)), 'the document changed in a round trip').toEqual(document);
      expect(JSON.stringify(document).split('\n').length, 'a raw newline reached the document').toBe(1);
      const foreign = new Set((document['foreignFields'] as { field: string }[]).map(entry => entry.field));
      const found = hostilePaths(document);
      expect(found.length, `${name} carried none of the hostile text, so the test proves nothing`).toBeGreaterThan(0);
      // a declared field covers its whole subtree: `wip` covers `wip.subject`
      const covered = (path: string): boolean => [...foreign].some(field => path === field || path.startsWith(`${field}.`) || path.startsWith(`${field}[]`));
      for (const path of found) expect(covered(path), `${name}: hostile text at '${path}', which foreignFields does not list`).toBe(true);
      for (const key of ['schema', 'id', 'outcome', 'next', 'stage', 'repository']) {
        const value = document[key];
        if (typeof value === 'string') expect(value, `${name}.${key} holds hostile text`).not.toContain('\u0007');
      }
    });
  }
});
