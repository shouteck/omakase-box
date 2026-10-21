// The prototype's own checks (node --test). Not part of the repository's
// verify: the prototype sits outside the pnpm workspace by design.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as f from '../lib/facts.mjs';
import { bounties as raw } from '../sample/sample.mjs';
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
  const priv = raw.find(b => b.repository === 'example-hidden/vault');
  assert.ok(priv, 'the sample keeps one private-repository bounty to prove this');
  assert.equal(f.findBounty(priv.id), null);
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
  assert.ok(f.visibleMethods('example-quill', 'example-mara').shown.some(m => m.kind === 'wise'));
  assert.ok(!f.visibleMethods('example-quill', 'example-orrin').shown.some(m => m.kind === 'wise'));
  for (const [p, t] of publicText()) assert.ok(!t.includes('quill@example.invalid'), p);
});

test('every bounty state has a sample, and every name is invented', () => {
  const states = new Set(f.bounties.map(f.stateOf));
  for (const s of Object.keys(f.STATES)) assert.ok(states.has(s), s);
  for (const b of raw) { assert.match(b.repository, /^example-[a-z]+\/[a-z-]+$/); assert.match(b.poster, /^example-/); for (const s of b.solutions) assert.match(s.author, /^example-/); }
  for (const login of Object.keys(f.people)) assert.match(login, /^example-/);
});

test('every built page carries the sample-data label', () => {
  const pages = builtHtml();
  if (!pages.length) return; // before the first build
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
  for (const b of raw) for (const n of [b.issue, ...b.solutions.map(s => s.pr)]) {
    const k = `${b.repository}#${n}`;
    assert.ok(!used[k], `${k} used twice`);
    used[k] = true;
  }
});

test('the sample self-dealing account says so', () => {
  assert.match(f.people['example-pike-alt'].sampleNote, /self-dealing/);
  assert.match(readFileSync(join(pub, 'people', 'example-pike-alt.json'), 'utf8'), /Sample self-dealing case/);
});

test('in-app navigation files resolve (Next asks for dotted names, the export writes folders)', async () => {
  const { segmentFile } = await import('./serve.mjs');
  assert.equal(segmentFile(join('x', 'b', 'bt-1', '__next.b.$d$id.__PAGE__.txt')), join('x', 'b', 'bt-1', '__next.b', '$d$id', '__PAGE__.txt'));
  assert.equal(segmentFile(join('x', 'me', '__next.me.__PAGE__.txt')), join('x', 'me', '__next.me', '__PAGE__.txt'));
  assert.equal(segmentFile(join('x', 'index.html')), join('x', 'index.html'));
  const built = join(root, 'out', 'me');
  if (existsSync(built)) for (const n of readdirSync(join(built, '__next.me'))) assert.ok(existsSync(segmentFile(join(built, `__next.me.${n}`))), n);
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
