// The prototype's own checks (node --test). Not part of the repository's
// verify: the prototype sits outside the pnpm workspace by design.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as f from '../lib/facts.mjs';
import { bounties as raw } from '../sample/sample.mjs';
import { privateBounties, privateRepositories, ownerOnlyMethods } from '../sample/restricted.mjs';
import { findBounties, getBounty } from '../mcp/standin.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const publicText = () => walk(pub).map(p => [p, readFileSync(p, 'utf8')]);
const builtHtml = () => existsSync(join(root, 'out')) ? walk(join(root, 'out')).filter(p => p.endsWith('.html') && !p.includes('screenshots')).map(p => [p, readFileSync(p, 'utf8')]) : [];

// A money word may appear only in a sentence that denies it.
export function moneyClaims(text) {
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'");
  return plain.split(/(?<=[.!?])\s+|\n/).filter(s => /\b(funded|guarantee[sd]?|escrow)\b/i.test(s) && !/\b(never|not|no)\b/i.test(s));
}

test('the money-word check catches a claim (must fail on a bad sentence)', () => {
  assert.deepEqual(moneyClaims('This bounty is funded and paid out by the board.'), ['This bounty is funded and paid out by the board.']);
  assert.deepEqual(moneyClaims('The board never holds, guarantees or moves money.'), []);
});

test('no feed file or built page implies the board holds, guarantees or moves money', () => {
  for (const [p, t] of [...publicText(), ...builtHtml()]) assert.deepEqual(moneyClaims(t), [], p);
});

test('a private repository never appears in the feed, details, people, RSS or pages', () => {
  const priv = privateBounties.find(b => b.repository === 'example-hidden/vault');
  assert.ok(priv, 'the sample keeps one private-repository bounty to prove this (sample/restricted.mjs)');
  assert.equal(f.findBounty(priv.id), null);
  // The read boundary drops it: what GitHub returns, public and private together, lists only the public.
  const read = f.listed([...raw, ...privateBounties], { ...f.repositories, ...privateRepositories });
  assert.deepEqual(read.map(b => b.id), f.bounties.map(b => b.id));
  for (const [p, t] of [...publicText(), ...builtHtml()]) {
    assert.ok(!t.includes('example-hidden') && !t.includes(priv.id) && !t.includes('PRIVATE SAMPLE'), p);
  }
  assert.ok(getBounty({ id: priv.id }).error.startsWith('No bounty'));
});

test('the committed sample feed is what the facts produce', () => {
  const feed = JSON.parse(readFileSync(join(pub, 'bounties.json'), 'utf8'));
  assert.deepEqual(feed.bounties, f.filterBounties(f.bounties).map(f.feedEntry));
  for (const b of f.bounties) assert.deepEqual(JSON.parse(readFileSync(join(pub, 'bounties', `${b.id}.json`), 'utf8')).bounty, f.bountyDetail(b));
});

test('field order decides first: id, title, reward, owner record, then where', () => {
  const keys = Object.keys(f.feedEntry(f.bounties[0]));
  assert.deepEqual(keys.slice(0, 5), ['id', 'poster_says', 'reward', 'owner', 'repository']);
  assert.equal(keys.at(-1), 'links');
});

test('bounds: a feed entry under 1.2 KB, a detail under 16 KB, limit at most 25', () => {
  for (const b of f.bounties) {
    assert.ok(JSON.stringify(f.feedEntry(b)).length < 1200, b.id);
    assert.ok(JSON.stringify(f.bountyDetail(b)).length < 16000, b.id);
  }
  assert.match(findBounties({ limit: 26 }).error, /^limit: must be 1 to 25/);
  assert.match(findBounties({ owner_record: 'good' }).error, /^owner_record: "good" is not allowed/);
  assert.match(findBounties({ colour: 'red' }).error, /^colour: not a filter/);
});

test('paging walks every open bounty exactly once', () => {
  const seen = []; let cursor;
  do { const page = findBounties({ limit: 2, ...(cursor ? { cursor } : {}) }); seen.push(...page.bounties.map(e => e.id)); cursor = page.next_cursor; } while (cursor);
  assert.deepEqual([...seen].sort(), f.filterBounties(f.bounties).map(b => b.id).sort());
});

test('the MCP stand-in and the board filter the same way', () => {
  for (const q of [{}, { language: 'TypeScript' }, { language: 'TypeScript', owner_record: 'confirmed-payments' }, { owner_record: 'no-history' }, { min_reward: 50, sort: 'reward' }, { solutions: 'none' }, { approved_by: 'owner-this-bounty' }, { query: 'csv' }]) {
    assert.deepEqual(findBounties({ ...q, limit: 25 }).bounties.map(e => e.id), f.filterBounties(f.bounties, q).map(b => b.id), JSON.stringify(q));
  }
});

test('self-dealing is not counted: the payee had push access', () => {
  const pike = f.ownerRecord('example-pike');
  assert.equal(pike.hasHistory, false);
  assert.equal(pike.notCounted, 1);
  assert.equal(f.solverRecord('example-pike-alt').merged, 0);
});

test('owner counts are attributed and add up', () => {
  const mara = f.ownerRecord('example-mara');
  assert.deepEqual([mara.merged, mara.recordedPaid, mara.confirmedReceived, mara.owedNow, mara.confirmers], [6, 5, 4, 1, 3]);
  const wren = f.ownerRecord('example-wren');
  assert.deepEqual([wren.merged, wren.recordedPaid, wren.confirmedReceived, wren.owedNow, wren.saysNotReceived], [4, 2, 1, 2, 1]);
  assert.equal(f.ownerLine(f.ownerRecord('example-orrin')), 'no history yet');
});

test('the owner recording paid, then the solver confirming, moves the state and the counts', () => {
  const id = 'bt-3a91c0e2d4f1';
  const b = f.findBounty(id);
  assert.equal(f.stateOf(b), 'merged-owed');
  const paid = { [id]: { paid: { at: f.SAMPLE_NOW, amount: 50, source: 'board' } } };
  assert.equal(f.stateOf(f.withOverlay(b, paid)), 'paid-recorded');
  assert.equal(f.ownerRecord('example-mara', paid).recordedPaid, 6);
  const both = { [id]: { ...paid[id], receipt: { at: f.SAMPLE_NOW, by: 'example-quill', kind: 'received' } } };
  assert.equal(f.stateOf(f.withOverlay(b, both)), 'received-confirmed');
  const notPayee = { [id]: { ...paid[id], receipt: { at: f.SAMPLE_NOW, by: 'example-sol', kind: 'received' } } };
  assert.equal(f.stateOf(f.withOverlay(b, notPayee)), 'paid-recorded', 'only the payee can confirm');
});

test('a method shown only to owed owners stays off public surfaces', () => {
  assert.ok(!f.visibleMethods('example-quill', null).shown.some(m => m.kind === 'wise'));
  // Changed by correction round 1 (B1): an owing owner gets it on the owed bounty's page, not anywhere.
  assert.ok(f.visibleMethods('example-quill', 'example-mara', f.findBounty('bt-3a91c0e2d4f1')).mayFetch);
  assert.ok(!f.visibleMethods('example-quill', 'example-orrin').shown.some(m => m.kind === 'wise'));
  for (const [p, t] of publicText()) assert.ok(!t.includes('quill@example.invalid'), p);
});

test('every bounty state has a sample, and every name is invented', () => {
  const states = new Set(f.bounties.map(f.stateOf));
  for (const s of Object.keys(f.STATES)) assert.ok(states.has(s), s);
  for (const b of [...raw, ...privateBounties]) { assert.match(b.repository, /^example-[a-z]+\/[a-z-]+$/); assert.match(b.poster, /^example-/); for (const s of b.solutions) assert.match(s.author, /^example-/); }
  for (const login of Object.keys(f.people)) assert.match(login, /^example-/);
});

test('every built page carries the sample-data label', t => {
  const pages = builtHtml();
  if (!pages.length) { t.skip('no out/ yet. Next: npm run build, then npm run check'); return; } // shown as skipped, never as a pass (L7)
  for (const [p, t] of pages) assert.ok(t.includes('Sample data.'), p);
});

test('the owner record has one shape, with or without history (K43 phase 2)', () => {
  const keys = Object.keys(f.feedRecord(f.ownerRecord('example-mara')));
  assert.deepEqual(Object.keys(f.feedRecord(f.ownerRecord('example-orrin'))), keys);
  assert.equal(f.feedRecord(f.ownerRecord('example-orrin')).has_history, false);
  for (const e of findBounties({ limit: 25 }).bounties) assert.equal(typeof e.owner.record, 'object', e.id);
});

test('"none disputed or owed over 14 days" leaves out an owner with a dispute or an old debt', () => {
  const ids = f.filterBounties(f.bounties, { owner_record: 'confirmed-none-late' }).map(b => b.poster);
  assert.ok(f.filterBounties(f.bounties, { owner_record: 'confirmed-payments' }).some(b => b.poster === 'example-wren'), 'wren has confirmed payments');
  assert.ok(!ids.includes('example-wren') && ids.includes('example-mara'));
  assert.deepEqual(findBounties({ owner_record: 'confirmed-none-late', limit: 25 }).bounties.map(e => e.id), f.filterBounties(f.bounties, { owner_record: 'confirmed-none-late' }).map(b => b.id));
});

test('every source is one of three defined names, and the legend defines them', () => {
  const feed = JSON.parse(readFileSync(join(pub, 'bounties.json'), 'utf8'));
  for (const name of ['github', 'project-record', 'board']) assert.ok(feed.legend.source.includes(`${name}:`), name);
  assert.ok(feed.legend['owner.record'].includes('from_solvers:'));
  for (const b of f.bounties) {
    const d = f.bountyDetail(b);
    for (const h of d.history) assert.ok(['github', 'project-record', 'board'].includes(h.source), `${b.id} ${h.source}`);
    for (const k of ['owed', 'recorded_paid', 'solver_says']) if (d.payment[k]) assert.ok(['github', 'project-record', 'board'].includes(d.payment[k].source), `${b.id} ${k}`);
  }
});

test('issue and pull request numbers never collide within a repository (GitHub shares one sequence)', () => {
  const used = {};
  for (const b of [...raw, ...privateBounties]) for (const n of [b.issue, ...b.solutions.map(s => s.pr)]) {
    const k = `${b.repository}#${n}`;
    assert.ok(!used[k], `${k} used twice`);
    used[k] = true;
  }
});

test('the sample self-dealing account says so', () => {
  assert.match(f.people['example-pike-alt'].sampleNote, /self-dealing/);
  assert.match(readFileSync(join(pub, 'people', 'example-pike-alt.json'), 'utf8'), /Sample self-dealing case/);
});

test('in-app navigation files resolve (Next asks for dotted names, the export writes folders)', async t => {
  const { segmentFile } = await import('./serve.mjs');
  assert.equal(segmentFile(join('x', 'b', 'bt-1', '__next.b.$d$id.__PAGE__.txt')), join('x', 'b', 'bt-1', '__next.b', '$d$id', '__PAGE__.txt'));
  assert.equal(segmentFile(join('x', 'me', '__next.me.__PAGE__.txt')), join('x', 'me', '__next.me', '__PAGE__.txt'));
  assert.equal(segmentFile(join('x', 'index.html')), join('x', 'index.html'));
  const built = join(root, 'out', 'me');
  if (!existsSync(built)) { t.skip('built files not checked: no out/ yet. Next: npm run build, then npm run check'); return; }
  for (const n of readdirSync(join(built, '__next.me'))) assert.ok(existsSync(segmentFile(join(built, `__next.me.${n}`))), n);
});

function lum(hex) { const c = hex.match(/\w\w/g).map(x => parseInt(x, 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('colour pairs meet WCAG 2.2 AA (4.5:1 for text) in light and dark', () => {
  const css = readFileSync(join(root, 'app', 'globals.css'), 'utf8');
  const [light, dark] = [css.slice(0, css.indexOf('@media')), css.slice(css.indexOf('@media'))];
  for (const block of [light, dark]) {
    const v = k => block.match(new RegExp(`--color-${k}:\\s*(#[0-9a-f]{6})`))[1];
    for (const k of ['ink', 'soft', 'accent']) assert.ok(contrast(v(k), v('paper')) >= 4.5, `${k} on paper: ${contrast(v(k), v('paper')).toFixed(2)}`);
    assert.ok(contrast(v('paper'), v('accent')) >= 4.5, 'paper on accent (the primary button)');
  }
});

test('self-dealing: a payee who is the poster is excluded even without push access (added by the pass)', () => {
  // A repository the sample does not know, so no push-access list can mask the poster clause.
  const b = { id: 'bt-000000000001', repository: 'example-none/none', poster: 'example-self', reward: 10, issueState: 'closed', paid: [], receipt: [],
    solutions: [{ pr: 2, author: 'example-self', state: 'merged', mergedAt: f.SAMPLE_NOW, headOnDefault: true }] };
  assert.equal(f.isSelfDealt(b), true);
  assert.equal(f.isSelfDealt({ ...b, solutions: [{ ...b.solutions[0], author: 'example-other' }] }), false, 'a stranger without push access is counted');
});

// ---------------------------------------------------------------------------
// K43 correction round 1: the pass's B1, M1, M2, M3 (each failed before its fix).
// ---------------------------------------------------------------------------

const ownerOnlyShown = (solver, viewer, b) => f.visibleMethods(solver, viewer, b).shown.some(m => m.visibility === 'owed-owners');

test('B1: an owner-only method never shows on a profile page to anyone but the solver', () => {
  // example-mara paid example-rook in full (bt-e3c9f5a7b1d2, received): she owes rook nothing.
  assert.equal(ownerOnlyShown('example-rook', 'example-mara'), false, 'paid-in-full owner on /solver/example-rook/');
  // example-mara owes example-quill on bt-3a91c0e2d4f1, but a profile page is not that bounty's page.
  assert.equal(ownerOnlyShown('example-quill', 'example-mara'), false, 'owing owner on /solver/example-quill/');
  assert.equal(f.mayseeOwnerOnly('example-rook', 'example-mara', null), false);
  assert.equal(f.mayseeOwnerOnly('example-rook', 'example-rook', null), true, 'the solver sees their own');
});

test('B1: only the owner who owes that solver now, on that bounty\'s page, until the payment is recorded', () => {
  const owed = f.findBounty('bt-3a91c0e2d4f1'); // mara owes quill $50, not recorded
  assert.equal(f.mayseeOwnerOnly('example-quill', 'example-mara', owed), true);
  assert.equal(f.mayseeOwnerOnly('example-quill', 'example-wren', owed), false, 'another owner');
  assert.equal(f.mayseeOwnerOnly('example-quill', 'example-sol', owed), false, 'another solver');
  assert.equal(f.mayseeOwnerOnly('example-quill', null, owed), false, 'a visitor');
  const recorded = f.withOverlay(owed, { [owed.id]: { paid: { at: f.SAMPLE_NOW, amount: 50, source: 'board' } } });
  assert.equal(f.mayseeOwnerOnly('example-quill', 'example-mara', recorded), false, 'recorded paid: the solver chose "owes me", not "for reference"');
  assert.equal(f.mayseeOwnerOnly('example-rook', 'example-mara', f.findBounty('bt-e3c9f5a7b1d2')), false, 'paid in full and received');
  assert.equal(f.mayseeOwnerOnly('example-quill', 'example-mara', f.findBounty('bt-4c6e19b0a2d8')), false, 'recorded paid, unconfirmed');
});

test('B1: the prototype server grants owner-only values exactly where the rule allows, and nowhere else', () => {
  const grants = JSON.parse(readFileSync(join(root, 'server', 'grants.json'), 'utf8')).grants;
  for (const g of grants) assert.ok(f.mayseeOwnerOnly(g.solver, g.viewer, g.bounty ? f.findBounty(g.bounty) : null), JSON.stringify(g));
  assert.ok(grants.some(g => g.viewer === 'example-mara' && g.solver === 'example-quill' && g.bounty === 'bt-3a91c0e2d4f1'));
  assert.ok(!grants.some(g => g.viewer === 'example-mara' && g.solver === 'example-rook'), 'mara owes rook nothing');
  for (const g of grants) if (g.viewer !== g.solver) assert.ok(g.bounty, 'an owner\'s grant is always for one bounty page');
});

test('M1: "owner decides" is owed on the bounty page exactly as in the owner\'s record', () => {
  for (const login of Object.keys(f.people)) {
    const r = f.ownerRecord(login);
    const owedOnPage = r.bounties.filter(b => !f.isSelfDealt(b) && f.paymentFacts(b).owed && !f.wordsOf(b).recordedPaid);
    assert.equal(owedOnPage.length, r.owedNow, login);
  }
  const od = f.findBounty('bt-7a0c5e8b3f21');
  assert.equal(f.paymentFacts(od).owed.amount, 30);
  assert.deepEqual(f.paymentFacts(od).owed.to_one_of, ['example-fern', 'example-rook']);
});

test('M1: the owner of an "owner decides" bounty records whom they paid, and it becomes an ordinary payment', () => {
  const od = f.findBounty('bt-7a0c5e8b3f21');
  const paidRook = { [od.id]: { paid: { at: f.SAMPLE_NOW, amount: 30, source: 'board', to: 'example-rook' } } };
  const b = f.withOverlay(od, paidRook);
  assert.equal(f.stateOf(b), 'paid-recorded');
  assert.equal(f.payeeOf(b).login, 'example-rook');
  assert.equal(f.ownerRecord('example-wren', paidRook).owedNow, 1);
  const notACandidate = f.withOverlay(od, { [od.id]: { paid: { ...paidRook[od.id].paid, to: 'example-sol' } } });
  assert.equal(f.stateOf(notACandidate), 'owner-decides', 'only a merged author can be named');
});

test('M2: self-dealing is read from GitHub\'s public author_association, never from push access', () => {
  const b = { id: 'bt-000000000002', repository: 'example-none/none', poster: 'example-owner', reward: 10, issueState: 'closed', paid: [], receipt: [],
    solutions: [{ pr: 2, author: 'example-other', state: 'merged', mergedAt: f.SAMPLE_NOW, headOnDefault: true, association: 'COLLABORATOR' }] };
  const as = a => f.isSelfDealt({ ...b, solutions: [{ ...b.solutions[0], association: a }] });
  for (const a of ['OWNER', 'MEMBER', 'COLLABORATOR']) assert.equal(as(a), true, a);
  for (const a of ['CONTRIBUTOR', 'FIRST_TIME_CONTRIBUTOR', 'FIRST_TIMER', 'NONE']) assert.equal(as(a), false, a);
  for (const repo of Object.values(f.repositories)) assert.equal(repo.pushAccess, undefined, 'the board cannot read push access');
  for (const x of f.bounties) for (const s of x.solutions) if (s.state === 'merged') assert.ok(f.ASSOCIATIONS.includes(s.association), `${x.id} #${s.pr}`);
});

const restrictedBytes = async () => {
  const r = await import('../sample/restricted.mjs');
  return [...r.privateBounties.flatMap(b => [b.id, b.title, b.repository]), ...Object.keys(r.privateRepositories),
    ...Object.values(r.ownerOnlyMethods).flat().map(m => m.value)];
};
const exportFiles = () => walk(join(root, 'out')).filter(p => !p.includes(`${join('out', 'screenshots')}`) && !/\.(png|woff2?|ico)$/.test(p));

test('M3: no file of the static export carries a private repository or an owner-only value (JS, JSON, TXT, HTML, XML, CSS)', async t => {
  if (!existsSync(join(root, 'out'))) { t.skip('no out/ yet. Next: npm run build, then npm run check'); return; }
  const bad = await restrictedBytes();
  const files = exportFiles();
  assert.ok(files.some(p => p.endsWith('.js')) && files.some(p => p.endsWith('.txt')), 'the scan reaches the client bundle and the navigation files');
  for (const p of files) { const t2 = readFileSync(p, 'utf8'); for (const s of bad) assert.ok(!t2.includes(s), `${s} in ${p}`); }
});

test('M3: no page, component or client module imports the restricted sample', () => {
  for (const d of ['app', 'components', 'lib', 'public']) for (const p of walk(join(root, d))) assert.ok(!/restricted/.test(readFileSync(p, 'utf8')), p);
});

test('B1: the prototype server answers only a granted viewer, and says why it refuses', async () => {
  const { ownerOnlyAnswer } = await import('./serve.mjs');
  const grants = JSON.parse(readFileSync(join(root, 'server', 'grants.json'), 'utf8')).grants;
  assert.equal(ownerOnlyAnswer(grants, { solver: 'example-quill', viewer: 'example-mara', bounty: 'bt-3a91c0e2d4f1' })[0], 200);
  const [code, body] = ownerOnlyAnswer(grants, { solver: 'example-rook', viewer: 'example-mara', bounty: '' });
  assert.equal(code, 403);
  assert.match(body.error, /only to an owner who owes them/);
  assert.equal(ownerOnlyAnswer(grants, { solver: 'example-quill', viewer: 'example-mara', bounty: '' })[0], 403, 'not on a profile page');
  assert.equal(ownerOnlyAnswer(null, { solver: 'example-quill', viewer: 'example-quill' })[0], 503);
  for (const [login, list] of Object.entries(ownerOnlyMethods)) assert.equal(f.people[login].ownerOnly, list.length, login);
  for (const p of walk(pub)) assert.ok(!p.includes('grants'), 'grants never in public/');
});

test('L4, L5: approval says when the record is silent, and every detail is marked sample data', () => {
  const silent = { ...f.findBounty('bt-0d7e4a3c8b65') };
  delete silent.approvedBy;
  assert.equal(f.feedEntry(silent).approved_by, null);
  for (const b of f.bounties) assert.equal(getBounty({ id: b.id }).bounty.sample_data, true, b.id);
});
