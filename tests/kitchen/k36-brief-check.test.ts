// reads: scripts/brief-check.mjs, waves/K36.md, waves/K37.md, docs/box-v4/DECISIONS.md
// K36: scripts/brief-check.mjs — the read-only pre-dispatch brief check.
// Every case runs the real CLI against a fabricated root under the OS temp
// dir, so a bad fixture really exits nonzero; nothing here scans the
// committed tree for literals except the one live-brief proof.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temps: string[] = [];
// One owned root per fixture: a spaced variant is a child inside the same
// mkdtemp root, so a single afterAll rm cleans both — a suffixed path beside
// the base used to orphan the empty base dir (K36 correction 2).
const temp = (suffix = '') => {
  const base = mkdtempSync(join(tmpdir(), 'kitchen-k36-'));
  temps.push(base);
  if (!suffix) return base;
  const dir = join(base, suffix.trim());
  mkdirSync(dir, { recursive: true });
  return dir;
};
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const LEDGER_ROW = '| D-2026-01-01-a | 2026-01-01 | documented | approved the fixture rollout | commit abc1234; waves/K1.md |';
const LEDGER = `| ID | Date | Kind | Scope | Source |
|---|---|---|---|---|
${LEDGER_ROW}
`;
const BRIEF = `# K9: fixture brief

Milestone: K · Station: evidence · Base: master
Owner decisions: D-2026-01-01-a

## Done when

- \`node scripts/verify.mjs test:kitchen\` exits 0 on the candidate.
- See the context in [waves/K1.md](waves/K1.md).

## Notes

Plain prose can name test:box-package as history without it being a command.
`;

// The smallest root the checker can judge: package.json scripts, the ledger,
// a linked wave file and the brief itself.
function fakeRoot({ brief = BRIEF, ledger = LEDGER as string | null, briefName = 'brief.md', wave = true } = {}): { dir: string; briefPath: string } {
  const dir = temp();
  mkdirSync(join(dir, 'docs', 'box-v4'), { recursive: true });
  mkdirSync(join(dir, 'waves'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { 'test:kitchen': 'node scripts/suite.mjs kitchen' } }));
  if (ledger !== null) writeFileSync(join(dir, 'docs', 'box-v4', 'DECISIONS.md'), ledger);
  if (wave) writeFileSync(join(dir, 'waves', 'K1.md'), '# K1\n');
  const briefPath = join(dir, briefName);
  writeFileSync(briefPath, brief);
  return { dir, briefPath };
}

function run(briefPath: string, rootDir: string) {
  const result = spawnSync(process.execPath, ['scripts/brief-check.mjs', briefPath, '--root', rootDir], { cwd: root, encoding: 'utf8', timeout: 30000 });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe('valid briefs pass, on roots with or without spaces', () => {
  it('a real-shaped brief exits 0', () => {
    const { dir, briefPath } = fakeRoot();
    const { status, out } = run(briefPath, dir);
    expect(status).toBe(0);
    expect(out).toContain('OK');
  });

  it('the same brief under a root path containing spaces exits 0', () => {
    const spaced = temp(' with space');
    // No orphan base: the spaced fixture lives inside an owned mkdtemp root.
    expect(temps).toContain(dirname(spaced));
    mkdirSync(join(spaced, 'docs', 'box-v4'), { recursive: true });
    mkdirSync(join(spaced, 'waves'), { recursive: true });
    writeFileSync(join(spaced, 'package.json'), JSON.stringify({ scripts: { 'test:kitchen': 'x' } }));
    writeFileSync(join(spaced, 'docs', 'box-v4', 'DECISIONS.md'), LEDGER);
    writeFileSync(join(spaced, 'waves', 'K1.md'), '# K1\n');
    const p = join(spaced, 'my brief.md');
    writeFileSync(p, BRIEF);
    expect(run(p, spaced).status).toBe(0);
  });
});

describe('named diagnostics on invalid input', () => {
  it('the BT36 mistake: a nonexistent suite in the acceptance command fails by name', () => {
    const bad = BRIEF.replace('test:kitchen', 'test:box-package');
    const { dir, briefPath } = fakeRoot({ brief: bad });
    const { status, out } = run(briefPath, dir);
    expect(status).toBe(1);
    expect(out).toContain('test:box-package');
    expect(out).toContain('package.json');
  });

  it('a linked wave file that does not exist is named', () => {
    const { dir, briefPath } = fakeRoot({ wave: false });
    const { status, out } = run(briefPath, dir);
    expect(status).toBe(1);
    expect(out).toContain('waves/K1.md');
  });

  it('an unknown decision ID is named; so is a duplicate ledger ID', () => {
    const unknown = BRIEF.replace('D-2026-01-01-a', 'D-2026-01-02-ghost');
    const { dir, briefPath } = fakeRoot({ brief: unknown });
    const { status, out } = run(briefPath, dir);
    expect(status).toBe(1);
    expect(out).toContain('D-2026-01-02-ghost');
    expect(out).toContain('unknown decision ID');

    const dup = fakeRoot({ ledger: LEDGER + LEDGER_ROW + '\n' });
    const again = run(dup.briefPath, dup.dir);
    expect(again.status).toBe(1);
    expect(again.out).toContain('duplicate decision ID D-2026-01-01-a');
  });

  it('a missing brief, a brief with no Done when, and a missing or malformed ledger all fail by name', () => {
    const { dir } = fakeRoot();
    expect(run(join(dir, 'nope.md'), dir).status).toBe(1);

    const noDone = fakeRoot({ brief: BRIEF.replace(/## Done when[\s\S]*?(?=## Notes)/, '') });
    const r1 = run(noDone.briefPath, noDone.dir);
    expect(r1.status).toBe(1);
    expect(r1.out).toContain('Done when');

    const noLedger = fakeRoot({ ledger: null });
    const r2 = run(noLedger.briefPath, noLedger.dir);
    expect(r2.status).toBe(1);
    expect(r2.out).toContain('DECISIONS.md');

    const badLedger = fakeRoot({ ledger: LEDGER.replace('2026-01-01 |', 'someday |') });
    const r3 = run(badLedger.briefPath, badLedger.dir);
    expect(r3.status).toBe(1);
    expect(r3.out).toContain('no ISO date');
  });

  it('an unresolved Owner decisions placeholder is named, not silently passed', () => {
    const placeholder = BRIEF.replace('Owner decisions: D-2026-01-01-a', 'Owner decisions: <fill me>');
    const { dir, briefPath } = fakeRoot({ brief: placeholder });
    const { status, out } = run(briefPath, dir);
    expect(status).toBe(1);
    expect(out).toContain('Owner decisions');
  });

  it('every Owner decisions field is checked: a second one cannot smuggle an unknown ID or a conflicting none', () => {
    const secondField = BRIEF.replace('Owner decisions: D-2026-01-01-a', 'Owner decisions: D-2026-01-01-a\nOwner decisions: D-2026-01-02-ghost');
    const { dir, briefPath } = fakeRoot({ brief: secondField });
    const { status, out } = run(briefPath, dir);
    expect(status).toBe(1);
    expect(out).toContain('Owner decisions');
    expect(out).toContain('D-2026-01-02-ghost');

    const conflict = fakeRoot({ brief: BRIEF.replace('Owner decisions: D-2026-01-01-a', 'Owner decisions: D-2026-01-01-a\nOwner decisions: none') });
    const c = run(conflict.briefPath, conflict.dir);
    expect(c.status).toBe(1);
    expect(c.out).toContain('Owner decisions');
  });

  it('one field mixing none with IDs, and one field repeating an ID, both fail by name', () => {
    const mixed = fakeRoot({ brief: BRIEF.replace('Owner decisions: D-2026-01-01-a', 'Owner decisions: none D-2026-01-01-a') });
    const m = run(mixed.briefPath, mixed.dir);
    expect(m.status).toBe(1);
    expect(m.out).toContain('mixes "none"');

    const repeated = fakeRoot({ brief: BRIEF.replace('Owner decisions: D-2026-01-01-a', 'Owner decisions: D-2026-01-01-a D-2026-01-01-a') });
    const r = run(repeated.briefPath, repeated.dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain('repeats D-2026-01-01-a');
  });

  it('suite spellings on command lines resolve exactly: npm run name and case-preserved test: tokens', () => {
    const npmRun = fakeRoot({ brief: BRIEF.replace('`node scripts/verify.mjs test:kitchen`', '`npm run test:box-package`') });
    const n = run(npmRun.briefPath, npmRun.dir);
    expect(n.status).toBe(1);
    expect(n.out).toContain('test:box-package');

    const upper = fakeRoot({ brief: BRIEF.replace('test:kitchen`', 'test:Kitchen`') });
    const u = run(upper.briefPath, upper.dir);
    expect(u.status).toBe(1);
    expect(u.out).toContain('test:Kitchen');

    const good = fakeRoot({ brief: BRIEF.replace('`node scripts/verify.mjs test:kitchen`', '`npm run test:kitchen`') });
    expect(run(good.briefPath, good.dir).status).toBe(0);
  });

  it('a direct vitest spelling in Done when is named unsupported, not silently accepted', () => {
    const vitest = fakeRoot({ brief: BRIEF.replace('`node scripts/verify.mjs test:kitchen`', '`npx vitest run tests/kitchen`') });
    const v = run(vitest.briefPath, vitest.dir);
    expect(v.status).toBe(1);
    expect(v.out).toContain('vitest');
  });
});

describe('fences and prose are not commands', () => {
  it('a fenced historical command naming a dead suite does not fail the brief', () => {
    const fenced = BRIEF + '\n```sh\nnode scripts/verify.mjs --full test:box-package\n```\n';
    const { dir, briefPath } = fakeRoot({ brief: fenced });
    const { status, out } = run(briefPath, dir);
    expect(status).toBe(0);
    expect(out).not.toContain('box-package');
  });
});

describe('read-only', () => {
  it('writes nothing into the root it checks', () => {
    const { dir, briefPath } = fakeRoot({ brief: BRIEF.replace('test:kitchen', 'test:box-package') });
    const before = (path: string): string[] => readdirSync(path, { recursive: true }).map(String).sort();
    const listing = before(dir);
    const content = (name: string) => readFileSync(join(dir, name), 'utf8');
    const files = listing.filter(name => statSync(join(dir, name)).isFile());
    const snapshot = files.map(name => [name, content(name)]);
    run(briefPath, dir);
    expect(before(dir)).toEqual(listing);
    for (const [name, text] of snapshot) expect(content(name as string)).toBe(text);
  });
});

describe('live proof', () => {
  it('the committed K36 brief passes against the real ledger and package scripts', () => {
    const { status, out } = run('waves/K36.md', root);
    expect(out).toBe(out); // keep stderr visible on failure below
    expect(status).toBe(0);
  });
});
