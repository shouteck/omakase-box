// BT32 pass probes — the reviewer's own adversarial regression, added by the
// independent pass (no product code touched). Where the main suite carries
// one representative case each, this file exercises EVERY scanned field,
// EVERY hostile remote-event shape the lens names, and a forged LOCAL ref
// carrying a well-formed event. Every probe drives the production path and
// asserts the refusal/effect itself, never a setup failure.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRecord, renderStatus, statusDocument, sharePosted, shareClosed, syncChains, sharedRead } from '../../../packages/box-bounty/index.js';
import { sharedPostedFixture, refused } from './github-fixture.js';
import type { GithubFixture } from './github-fixture.js';
import { git, readRecordRaw, runRoot, writeRecordRaw } from './support.js';

const SECRET = 'ghp_' + 'A'.repeat(36);
const MARKER = 'PROBE-NEVER-SHOWN-7f3c';

const bareTip = (world: { bare: string }, id: string): string | null => {
  const out = execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'ls-remote', world.bare, `refs/box-bounty/${id}`], { encoding: 'utf8' }).trim();
  return out === '' ? null : out.split('\t')[0]!;
};
const looseObjects = (repo: string): number =>
  Number(/^count: (\d+)$/m.exec(git(repo, ['count-objects', '-v']))?.[1] ?? -1);
const secondMachine = (world: GithubFixture): string => {
  const clone = join(runRoot('bt32-probe-machine-b'), 'repo');
  execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'clone', '--no-local', world.bare, clone], { encoding: 'utf8' });
  git(clone, ['remote', 'set-url', 'origin', 'git@github.com:owner/project.git']);
  return clone;
};

// A writer machine that pushes arbitrary event commits straight onto the
// bare remote — the remote is transport, not authority, so a hostile chain
// is a real input the importer must survive.
function writerOf(world: GithubFixture) {
  const dir = join(runRoot('bt32-probe-writer'), 'w');
  execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'clone', '--no-checkout', world.bare, dir], { encoding: 'utf8' });
  const run = (args: string[], input?: string) =>
    execFileSync('git', ['-c', `safe.directory=${dir}`, '-c', 'user.name=x', '-c', 'user.email=x@x', '-C', dir, ...args], { input, encoding: 'utf8' }).trim();
  const commitEvent = (id: string, event: string, parents: string[]): string => {
    const blob = run(['hash-object', '-w', '--stdin'], event);
    const tree = run(['mktree'], `100644 blob ${blob}\tevent.json\n`);
    return run(['commit-tree', tree, '-m', `box-bounty ${id} chain event`, ...parents.flatMap(p => ['-p', p])]);
  };
  const setRef = (id: string, sha: string) => run(['update-ref', `refs/box-bounty/${id}`, sha]);
  const push = (id: string) => run(['push', 'origin', `refs/box-bounty/${id}:refs/box-bounty/${id}`]);
  return { commitEvent, setRef, push };
}
const postedEvent = (id: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ v: 1, type: 'posted', at: '2026-10-18T00:00:00.000Z', actor: 'stranger', id, title: `probe ${id}`, task: 't', base: 'a'.repeat(40), branch: 'main', issue: { number: 9, url: 'https://github.com/owner/project/issues/9' }, published: { pushed: [] }, ...extra }) + '\n';

describe('BT32 pass probes', { timeout: 120000 }, () => {

  it('a secret in ANY scanned field holds the event before a single object is written', () => {
    { const world = sharedPostedFixture(); world.run(() => {
      const record = () => loadRecord(world.repo, world.id);
      const mutate = (change: (raw: Record<string, unknown>) => void) => {
        const raw = JSON.parse(readRecordRaw(world.repo, world.id)) as Record<string, unknown>;
        change(raw);
        writeRecordRaw(world.repo, world.id, JSON.stringify(raw));
      };
      // Each leg: the scan fires BEFORE hash-object — the loose-object count
      // must not move, no local chain ref may appear, nothing reaches the remote.
      const chainTipNow = () => git(world.repo, ['for-each-ref', `refs/box-bounty/${world.id}`]);
      const expectHeld = (label: string, action: () => unknown) => {
        const before = looseObjects(world.repo);
        const refBefore = chainTipNow();
        refused(action, 'publish-held');
        expect(looseObjects(world.repo), `${label}: objects written despite the hold`).toBe(before);
        expect(chainTipNow(), `${label}: the chain ref moved despite the hold`).toBe(refBefore);
      };
      const postedTip = bareTip(world, world.id);
      expect(postedTip, 'fixture is not posted — setup failed').not.toBeNull();

      expectHeld('title', () => { mutate(r => { r['title'] = `need ${SECRET}` }); sharePosted(world.repo, record(), 'task'); });
      mutate(r => { r['title'] = 'Repair app'; });
      expectHeld('task', () => sharePosted(world.repo, record(), `do it ${SECRET}`));
      expectHeld('why', () => { mutate(r => { r['why'] = `x ${SECRET}` }); sharePosted(world.repo, record(), 'task'); });
      mutate(r => { delete r['why']; });
      expectHeld('partOf', () => { mutate(r => { r['partOf'] = `job ${SECRET}` }); sharePosted(world.repo, record(), 'task'); });
      mutate(r => { delete r['partOf']; });
      expectHeld('followup', () => { mutate(r => { r['resume'] = { kind: 'recorded', branch: 'main', commit: 'a'.repeat(40), changed: [], note: `resume ${SECRET}` } }); sharePosted(world.repo, record(), 'task'); });
      mutate(r => { r['resume'] = { kind: 'not-recorded' }; });
      expectHeld('reason', () => shareClosed(world.repo, record(), 'rejected', `because ${SECRET}`, false));
      // The real posted chain still stands untouched.
      expect(bareTip(world, world.id)).toBe(postedTip);
    }); }
  });

  it('hostile remote events — oversized, never-field, malformed — are skipped, never shown', () => {
    { const world = sharedPostedFixture(); world.run(() => {
      const writer = writerOf(world);
      const ids = {
        oversized: 'bt-' + '01'.repeat(6),
        never: 'bt-' + '02'.repeat(6),
        malformed: 'bt-' + '03'.repeat(6),
        nested: 'bt-' + '04'.repeat(6)
      };
      // Chain A: a valid posted, then an oversized closed (reason > 8000) —
      // the bad event is dropped, the good remainder still folds.
      const tipA = writer.commitEvent(ids.oversized, postedEvent(ids.oversized), []);
      const tipA2 = writer.commitEvent(ids.oversized, JSON.stringify({ v: 1, type: 'closed', at: '2026-10-18T01:00:00.000Z', kind: 'withdrawn', reason: 'r'.repeat(9000) }) + '\n', [tipA]);
      writer.setRef(ids.oversized, tipA2); writer.push(ids.oversized);
      // Chain B: a top-level never-field makes the posted event invalid —
      // a chain with no valid posted produces no row at all.
      const tipB = writer.commitEvent(ids.never, postedEvent(ids.never, { scanFindings: [MARKER] }), []);
      writer.setRef(ids.never, tipB); writer.push(ids.never);
      // Chain C: an unparseable blob.
      const tipC = writer.commitEvent(ids.malformed, `{"v":1,"type":"posted", ${MARKER}\n`, []);
      writer.setRef(ids.malformed, tipC); writer.push(ids.malformed);
      // Chain D: a NESTED unknown field inside an allow-listed object. The
      // schema bounds size/shape, not nested key names — so the fold itself
      // is the allow-list: the planted text must never surface.
      const tipD = writer.commitEvent(ids.nested, postedEvent(ids.nested, { issue: { number: 9, url: 'https://github.com/owner/project/issues/9', planted: MARKER } }), []);
      writer.setRef(ids.nested, tipD); writer.push(ids.nested);

      const other = secondMachine(world);
      const clean = git(other, ['status', '--porcelain']);
      const branches = git(other, ['for-each-ref', '--format=%(refname)', 'refs/heads']);
      syncChains(other, true);
      // A's posted folds; the oversized close is skipped (stage stays posted).
      expect(sharedRead(other, ids.oversized)?.stage).toBe('posted');
      // B and C contribute nothing.
      expect(sharedRead(other, ids.never)).toBeNull();
      expect(sharedRead(other, ids.malformed)).toBeNull();
 

      // D imported — but the planted nested text is absent from every
      // rendered surface and from the stored row.
      const nestedRow = sharedRead(other, ids.nested);
      expect(nestedRow?.id, 'nested-field chain did not import — probe did not reach the fold').toBe(ids.nested);
      const status = renderStatus(other);
      const doc = JSON.stringify(statusDocument(other, {}, () => {}));
      for (const surface of [status, doc, JSON.stringify(nestedRow)]) {
        expect(surface, 'planted never-field text surfaced').not.toContain(MARKER);
      }
      expect(status).not.toContain(`probe ${ids.never}`);
      // Import is ref-and-db only: worktree, index and branches unmoved.
      expect(git(other, ['status', '--porcelain'])).toBe(clean);
      expect(git(other, ['for-each-ref', '--format=%(refname)', 'refs/heads'])).toBe(branches);
    }); }
  });

  it('a forged LOCAL chain ref with a well-formed event is never adopted or shown', () => {
    { const world = sharedPostedFixture(); world.run(() => {
      const other = secondMachine(world);
      const fake = 'bt-' + 'ee'.repeat(6);
      const run = (args: string[], input?: string) =>
        execFileSync('git', ['-c', `safe.directory=${other}`, '-c', 'user.name=x', '-c', 'user.email=x@x', '-C', other, ...args], { input, encoding: 'utf8' }).trim();
      // A perfectly valid posted event — but written directly under
      // refs/box-bounty/ on this machine, never fetched from the remote.
      const blob = run(['hash-object', '-w', '--stdin'], postedEvent(fake, { title: MARKER }));
      const tree = run(['mktree'], `100644 blob ${blob}\tevent.json\n`);
      const commit = run(['commit-tree', tree, '-m', 'forged']);
      run(['update-ref', `refs/box-bounty/${fake}`, commit]);
      syncChains(other, true);
      expect(sharedRead(other, fake)).toBeNull();
      const status = renderStatus(other);
      expect(status).not.toContain(MARKER);
      expect(status).not.toContain(fake);
      // Trust boundary named exactly: refs/box-bounty/* is the tool's own
      // namespace, so a local ref IS pushed on the next sync — the design's
      // write authority is push access to the remote, not local ref
      // provenance. Assert it went out verbatim (the same commit), which
      // pins that the boundary is authentication, not local inspection.
      expect(bareTip(world, fake)).toBe(commit);
    }); }
  });
});
