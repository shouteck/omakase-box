// K28 step 5 — builds the two experiment worlds in --out (default
// %TEMP%\kitchen-K28-worlds):
//   remote.git   bare scratch remote with the project + bounty chains
//   base/        the authoring clone (kept for audit)
//   world-a/     a --no-local clone WITH the chains fetched + chain.mjs
//   world-b/     a --no-local clone with only public issue texts in issues/
//   truth-key.json   the known history + scoring rubric
//   prompts/participant-a.txt, participant-b.txt   identical question lists
// Refuses a nonempty --out without the .kitchen-K28-owned marker.
// Rerun: node kitchen/memory/delegation/worlds.mjs [--out <dir>]

import { mkdirSync, existsSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, append, fetchChains, pushChains, NS } from './chain.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const out = (() => {
  const i = process.argv.indexOf('--out');
  if (i >= 0) return resolve(process.argv[i + 1]);
  return join(tmpdir(), 'kitchen-K28-worlds');
})();
if (existsSync(out) && readdirSync(out).length > 0 && !existsSync(join(out, '.kitchen-K28-owned'))) {
  console.error(`refusing: ${out} is nonempty and was not created by this script`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, '.kitchen-K28-owned'), new Date().toISOString());

const remote = join(out, 'remote.git');
const base = join(out, 'base');
git(out, ['init', '--bare', remote]);
git(out, ['clone', remote, base]);
const W = (p, s) => writeFileSync(join(base, p), s);
const C = (msg) => { git(base, ['add', '-A']); git(base, ['-c','user.name=agent-owner','-c','user.email=owner@k28','commit','-m',msg]); return git(base,['rev-parse','HEAD']); };

// ---- realistic project history ----
W('README.md', '# Acme service\n');
mkdirSync(join(base,'src/session'),{recursive:true});
mkdirSync(join(base,'src/auth'),{recursive:true});
mkdirSync(join(base,'src/report'),{recursive:true});
mkdirSync(join(base,'tests/auth'),{recursive:true});
W('src/session/store.js', '// memory session store\nlet mem = {};\nmodule.exports = { get: (k) => mem[k] };\n');
W('src/auth/login.js', '// login handler\n');
W('src/report/csv.js', '// csv export stub\n');
C('initial: session store, login, report stubs');

const mergeBounty = (id, title, attemptN, files) => {
  git(base, ['checkout','-b',`sol-${id}`]);
  for (const [p, s] of Object.entries(files)) { const d = join(base,p); mkdirSync(dirname(d),{recursive:true}); writeFileSync(d,s); }
  const sol = C(`solution for ${id}`);
  git(base, ['checkout','master']);
  const msg = `box bounty ${id}: ${title}\n\nattempt: ${attemptN}\nsolution: ${sol}`;
  git(base, ['-c','user.name=box-bounty','-c','user.email=box-bounty@localhost','merge','--no-ff','-m',msg,sol]);
  const merge = git(base,['rev-parse','HEAD']);
  git(base, ['branch','-d',`sol-${id}`]);
  return { sol, merge };
};

const B = [];
{
  const m = mergeBounty('bt-a101','Replace session store with Redis',1,{'src/session/store.js':'// redis session store\nconst redis = require("./redis-client");\nmodule.exports = { get: async (k) => redis.get(k) };\n'});
  B.push({ id:'bt-a101', title:'Replace session store with Redis', partOf:'oauth-migration', state:'closed-merged', sol:m.sol, merge:m.merge, issue:11 });
}
{
  const m = mergeBounty('bt-a102','Fix flaky refresh-token test',2,{'tests/auth/refresh.test.js':'// uses fake timers; mocks Date.now\n'});
  B.push({ id:'bt-a102', title:'Fix flaky refresh-token test', partOf:'oauth-migration', state:'closed-merged', sol:m.sol, merge:m.merge, issue:12 });
}
{
  const m = mergeBounty('bt-a104','Rate-limit the login endpoint',1,{'src/auth/login.js':'// login handler with rate limit\nconst bucket = {};\nmodule.exports = { login };\nfunction login(){} \n'});
  B.push({ id:'bt-a104', title:'Rate-limit the login endpoint', partOf:'oauth-migration', state:'closed-merged', sol:m.sol, merge:m.merge, issue:14 });
}
{
  const m = mergeBounty('bt-b201','CSV export of the audit log',1,{'src/report/csv.js':'// csv export of audit log\nmodule.exports = rows => rows.map(r=>r.join(",")).join("\n");\n'});
  B.push({ id:'bt-b201', title:'CSV export of the audit log', partOf:'report-export', state:'closed-merged', sol:m.sol, merge:m.merge, issue:21 });
}
{
  const m = mergeBounty('bt-c301','Fix README typo',1,{'README.md':'# Acme service\n\nFixed the title typo.\n'});
  B.push({ id:'bt-c301', title:'Fix README typo', partOf:null, state:'closed-merged', sol:m.sol, merge:m.merge, issue:30, reward:0 });
}
B.push({ id:'bt-a103', title:'Revoke-session cleanup job', partOf:'oauth-migration', state:'closed-abandoned', issue:13 });
B.push({ id:'bt-b202', title:'PDF summary of the audit report', partOf:'report-export', state:'closed-rejected', issue:22 });
B.push({ id:'bt-b203', title:'Weekly email of the audit report', partOf:'report-export', state:'open', issue:23 });

const WHY = {
  'bt-a101':'the in-memory session store blocked horizontal scaling for the OAuth migration; two in-house fixes (write-through map, sticky sessions) both failed under concurrent logins',
  'bt-a102':'the refresh-token test flaked ~1 in 8 runs; three in-house fixes (retry wrapper, longer timeout, seed fix) all failed — suspected clock skew in the mock',
  'bt-a103':'revoked sessions were never cleaned, growing the store; deferred until the store itself was replaced',
  'bt-a104':'login needed rate limiting before the OAuth cutover; posted from the second workstation while this machine was mid-merge',
  'bt-b201':'compliance asked for an exportable audit trail; the report-export job needed a machine-checkable format first',
  'bt-b202':'management wanted a printable summary on top of the CSV export',
  'bt-b203':'final piece of report-export: scheduled weekly email of the audit report',
  'bt-c301':'drive-by typo, posted to trial the tool with a free bounty',
};
const TRIED = {
  'bt-a101':'write-through map (lost sessions on restart); sticky sessions (broke rolling deploys)',
  'bt-a102':'jest retry wrapper; timeout 5s->30s; fixed RNG seed',
  'bt-b201':'naive join produced broken CSV on commas in log messages',
};

// ---- write the event chains (the delegation record) ----
const T = d => `2026-10-0${d}T12:00:00Z`;
const E = (id, ev) => append(base, id, ev);
for (const b of B) {
  E(b.id, { type:'decided', at:T(1), actor:'agent-owner', why:WHY[b.id], partOf:b.partOf, tried:TRIED[b.id] ?? null });
  E(b.id, { type:'posted', at:T(2), actor:'agent-owner', destination:'github', issue:b.issue, reward:b.reward ?? 100 });
}
E('bt-a101',{ type:'solution-arrived', at:T(3), actor:'solver:alice-dev', attempt:1, author:'alice-dev', commit:B[0].sol });
E('bt-a101',{ type:'merged', at:T(4), actor:'agent-owner', attempt:1, merge:B[0].merge });
E('bt-a101',{ type:'closed', at:T(5), actor:'agent-owner', paid:{ amount:100, to:'alice-dev', link:'pay.example/alice-1' } });
E('bt-a102',{ type:'solution-arrived', at:T(3), actor:'solver:bob-codes', attempt:1, author:'bob-codes', commit:'deadbeef'.repeat(5) });
E('bt-a102',{ type:'set-aside', at:T(3), actor:'agent-owner', attempt:1, reason:'touched the same clock mock the bounty warned about' });
E('bt-a102',{ type:'solution-arrived', at:T(4), actor:'solver:carol-ops', attempt:2, author:'carol-ops', commit:B[1].sol });
E('bt-a102',{ type:'merged', at:T(4), actor:'agent-owner', attempt:2, merge:B[1].merge });
E('bt-a102',{ type:'closed', at:T(5), actor:'agent-owner', paid:{ amount:100, to:'carol-ops', link:'pay.example/carol-2' } });
E('bt-a104',{ type:'solution-arrived', at:T(3), actor:'solver:dave-h', attempt:1, author:'dave-h', commit:B[2].sol });
E('bt-a104',{ type:'merged', at:T(4), actor:'agent-machine2', attempt:1, merge:B[2].merge });
E('bt-a104',{ type:'closed', at:T(5), actor:'agent-machine2', paid:{ amount:100, to:'dave-h', link:'pay.example/dave-4' } });
E('bt-b201',{ type:'solution-arrived', at:T(3), actor:'solver:erin-t', attempt:1, author:'erin-t', commit:B[3].sol });
E('bt-b201',{ type:'merged', at:T(4), actor:'agent-owner', attempt:1, merge:B[3].merge });
E('bt-b201',{ type:'closed', at:T(5), actor:'agent-owner', paid:{ amount:100, to:'erin-t', link:'pay.example/erin-5' } });
E('bt-c301',{ type:'solution-arrived', at:T(3), actor:'solver:frank-l', attempt:1, author:'frank-l', commit:B[4].sol });
E('bt-c301',{ type:'merged', at:T(4), actor:'agent-owner', attempt:1, merge:B[4].merge });
E('bt-c301',{ type:'closed', at:T(5), actor:'agent-owner', paid:null });
E('bt-a103',{ type:'solution-arrived', at:T(3), actor:'solver:grace-p', attempt:1, author:'grace-p', commit:'cafebabe'.repeat(5) });
E('bt-a103',{ type:'closed', at:T(6), actor:'agent-owner', abandoned:'solution arrived too late; cleanup folded into the bt-a104 work — bounty cancelled', paid:null });
E('bt-b202',{ type:'solution-arrived', at:T(3), actor:'solver:heidi-r', attempt:1, author:'heidi-r', commit:'f00dd00d'.repeat(5) });
E('bt-b202',{ type:'closed', at:T(6), actor:'agent-owner', rejected:'solution pulled a 40 MB PDF library for a 200-line report; set aside and closed unsolved', paid:null });
// bt-b203: open, no further events

git(base, ['push','origin','master']);
pushChains(base);

const TASK = {
  'bt-a101':'Replace the in-memory session store in src/session/store.js with Redis so sessions survive restarts and horizontal scaling.',
  'bt-a102':'tests/auth/refresh.test.js flakes ~1 in 8 runs. Find the real cause (do not just retry or raise timeouts — we tried those) and fix it.',
  'bt-a103':'Add a cleanup job that removes revoked sessions from the store.',
  'bt-a104':'Add rate limiting to the login endpoint in src/auth/login.js (per-IP bucket, 5/min).',
  'bt-b201':'Add CSV export of the audit log to src/report/csv.js. Must quote fields containing commas.',
  'bt-b202':'Add a PDF summary of the audit report. Keep dependencies minimal.',
  'bt-b203':'Send the audit report by email weekly (schedule + send).',
  'bt-c301':'README has a typo in the project title.',
};
const PUBLIC_OUTCOME = {
  'bt-a101':'Closed. Solution from alice-dev merged.',
  'bt-a102':'Closed. Solution from carol-ops merged (a second solution arrived after the first was set aside).',
  'bt-a103':'Closed. A solution from grace-p arrived but the bounty was cancelled.',
  'bt-a104':'Closed. Solution from dave-h merged.',
  'bt-b201':'Closed. Solution from erin-t merged.',
  'bt-b202':'Closed. One solution arrived from heidi-r; not merged.',
  'bt-b203':'Open. No solutions yet.',
  'bt-c301':'Closed. Solution from frank-l merged.',
};

// ---- world (a): clone with chains fetched ----
const wa = join(out,'world-a');
git(out, ['clone','--no-local', remote, wa]);
fetchChains(wa);
mkdirSync(join(wa,'.k28'),{recursive:true});
copyFileSync(join(HERE,'chain.mjs'), join(wa,'.k28','chain.mjs'));
writeFileSync(join(wa,'.k28','README.md'),
`This clone carries the project's delegation chains on git refs ${NS}/*.
Read them with the bundled prototype (no install):
  node .k28/chain.mjs ids        # list bounty ids that have chains
  node .k28/chain.mjs events     # every event of every chain, one JSON per line
  node .k28/chain.mjs events . bt-a101   # one bounty only (use: . <id>)
`);

// ---- world (b): clone with only the public issue texts ----
const wb = join(out,'world-b');
git(out, ['clone','--no-local', remote, wb]);
mkdirSync(join(wb,'issues'),{recursive:true});
for (const b of B) {
  const stateLine = b.state === 'open' ? 'open' : 'closed';
  writeFileSync(join(wb,'issues',`${b.id}.md`),
`# Issue #${b.issue}: ${b.title}   [${stateLine}]   id: ${b.id}   reward: $${b.reward ?? 100}

${TASK[b.id]}

${PUBLIC_OUTCOME[b.id] ?? ''}
`);
}
git(wb, ['add','-A']);
git(wb, ['-c','user.name=agent-owner','-c','user.email=owner@k28','commit','-m','public issue texts']);

// ---- truth key ----
const truth = {
  note: 'Known history of the scratch project. Score each answer right / partly / wrong.',
  bounties: B.map(b => ({ ...b })),
  questions: [
    { q: 1, expect: 'One open bounty: bt-b203 (weekly email of the audit report, part of report-export, posted, no solutions yet). Everything else is closed: bt-a101, bt-a102, bt-a104, bt-b201, bt-c301 merged; bt-a103 abandoned; bt-b202 closed unsolved. Only bt-b203 is waiting (for any solution).' },
    { q: 2, expect: 'bt-a101 was handed off because the in-memory session store blocked horizontal scaling for the oauth-migration job; two in-house fixes (write-through map, sticky sessions) had been tried and failed.' },
    { q: 3, expect: 'bt-a102 belongs to oauth-migration; the job stood mid-migration (session store already replaced via bt-a101, rate limiting in flight via bt-a104, the flaky test still open).' },
    { q: 4, expect: 'bt-b201: one solution came back from solver erin-t; it was accepted and merged (attempt 1).' },
    { q: 5, expect: 'src/session/store.js was last changed by the merge commit for bt-a101 ("Replace session store with Redis") — the Redis store is the merged bounty solution; reachable via git log/blame to the merge commit naming bt-a101.' },
    { q: 6, expect: 'Yes — report-export had two earlier bounties: bt-b201 (CSV export, merged, paid) and bt-b202 (PDF summary, one solution rejected for a 40 MB dependency, closed unsolved).' },
    { q: 7, expect: 'bt-a102 solver carol-ops was paid $100 (attempt 2 merged). bt-a103 was never paid — cancelled after the solution arrived too late.' },
    { q: 8, expect: 'oauth-migration: bt-a101 (merged, paid), bt-a102 (merged at attempt 2, paid), bt-a104 (merged, paid, run from the second machine), bt-a103 (abandoned/cancelled, unpaid).' },
  ],
  rubric: 'right = all key facts stated, none invented; partly = some key facts right but incomplete or one error; wrong = missing, invented, or contradicted.',
};
writeFileSync(join(out,'truth-key.json'), JSON.stringify(truth, null, 2));

// ---- participant prompts (identical question list) ----
const QUESTIONS = [
'1. What bounty work is outstanding on this project, and what is it waiting on?',
'2. Why was bt-a101 handed off instead of done in-house, and what had been tried?',
'3. Which larger job does bt-a102 belong to, and where did that job stand?',
'4. For bt-b201: what came back, from whom, and which was accepted?',
'5. Look at src/session/store.js — why does it look the way it does? Trace the last change to the work that produced it.',
'6. Has this project handed off work like bt-b203 (its kind of task) before? How did it go?',
'7. Were the solvers paid — for bt-a102, and for bt-a103?',
'8. Which bounties belong to the oauth-migration job, and how did each one end?',
].join('\n');
mkdirSync(join(out,'prompts'),{recursive:true});
writeFileSync(join(out,'prompts','participant-a.txt'),
`You are working in the git repository at ${wa}.

This repository carries a "delegation record" for handed-off work on git refs ${NS}/*, readable with the bundled helper:
  node .k28/chain.mjs ids
  node .k28/chain.mjs events
  node .k28/chain.mjs events . <bounty-id>
(see .k28/README.md). You may also use ordinary git commands.

Answer the following questions about this project's handed-off work, using whatever is in this repository. Cite where each answer came from.

${QUESTIONS}

Report one numbered answer per question.`);
writeFileSync(join(out,'prompts','participant-b.txt'),
`You are working in the git repository at ${wb}.

Answer the following questions about this project's handed-off work, using whatever is in this repository. Cite where each answer came from.

${QUESTIONS}

Report one numbered answer per question.`);

console.log(`built: ${out}`);
console.log(`  world-a (chains): ${wa}`);
console.log(`  world-b (issues only): ${wb}`);
console.log(`  truth key: ${join(out,'truth-key.json')}`);
