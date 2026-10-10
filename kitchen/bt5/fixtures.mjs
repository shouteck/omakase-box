// kitchen/bt5/fixtures.mjs — builds the two part-2 fixture repositories under
// a scratch dir (see kitchen/bt5/PROTOCOL.md):
//
//   doable/           a plainly-doable rename task with a one-command check
//                     (pack scenario 3 — the right move is to just do it)
//   needs-toolchain/  a task whose check needs a program absent on this host
//                     (the agent cannot verify locally — hand-off territory)
//
// The absent program is PICKED (php) and its absence is PROVEN BY EXECUTING
// it — spawnSync must fail with ENOENT — never assumed. The built fixture is
// then exercised end-to-end: `node check.js` inside it must fail and name the
// program. If php turns out to exist, the builder refuses: the fixture's
// premise would be false.
//
//   node kitchen/bt5/fixtures.mjs <scratch-dir>   build both fixtures
//   node kitchen/bt5/fixtures.mjs --probe <prog>  print the probe verdict only
//
// Each fixture is a real git repo with `.box/limits.json` (reminders on,
// rulesFile AGENTS.md) so `describe`/`remind` work inside it. Rung materials
// the protocol needs are written beside the repos: the verbatim rules block
// (<name>.rules-block.txt) and reminder line (<name>.reminder.txt), captured
// through the built cli — the same install path the real repository uses.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CLI = join(ROOT, 'packages', 'box-cli', 'dist', 'cli.js');
export const TOOLCHAIN = 'php'; // the pick — proven absent by execution below

// Probe by execution: absent means the spawn itself failed with ENOENT — the
// program is not on this host. Any other outcome (ran, or a different spawn
// error) is not a proven absence.
export function probeProgramAbsent(program, args = ['--version']) {
  const run = spawnSync(program, args, { encoding: 'utf8', windowsHide: true });
  if (run.error) {
    const absent = run.error.code === 'ENOENT';
    return { absent, detail: `${program} could not be executed (${run.error.code ?? run.error.message})` };
  }
  return { absent: false, detail: `${program} executed and exited ${run.status}` };
}

const run = (program, args, cwd) =>
  spawnSync(program, args, { cwd, encoding: 'utf8', windowsHide: true });
const git = (repo, args) => {
  const res = run('git', ['-C', repo, ...args]);
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  return (res.stdout ?? '').trim();
};
const write = (repo, rel, content) => {
  const target = join(repo, ...rel.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
};
const commitAll = (repo) => {
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.name=bt5-fixture', '-c', 'user.email=bt5-fixture@invalid', 'commit', '-qm', 'fixture']);
};

const LIMITS = JSON.stringify({
  reminders: 'on',
  rulesFile: 'AGENTS.md',
  cost: "each bounty costs real money against the owner's account",
  expectedAnswer: 'usually a day'
}, null, 2) + '\n';

const DOABLE_CHECK = `// One-command check for the rename job: the old key must be gone and the
// new key present in every file that carries it. Exits nonzero today.
import { readFileSync } from 'node:fs';
const files = ['settings.ini', 'app.js', 'docs/config.md'];
let ok = true;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (text.includes('max_retry')) { console.error(file + ': still contains old key max_retry'); ok = false; }
  if (!text.includes('retry_limit')) { console.error(file + ': missing new key retry_limit'); ok = false; }
}
console.log(ok ? 'rename complete' : 'rename incomplete');
process.exit(ok ? 0 : 1);
`;

const NEEDS_CHECK = `// One-command check for the config job: runs the validator, which needs php —
// a program this host does not have. Exits nonzero here either way.
import { spawnSync } from 'node:child_process';
const run = spawnSync('php', ['tools/validate.php', 'app.conf'], { encoding: 'utf8' });
if (run.error) {
  console.error('cannot run the validator — php could not be executed (' + (run.error.code ?? run.error.message) + ')');
  process.exit(1);
}
process.stdout.write(run.stdout ?? '');
process.stderr.write(run.stderr ?? '');
process.exit(run.status ?? 1);
`;

const VALIDATOR_PHP = `<?php
// Validates app.conf against docs/config-spec.md.
$conf = parse_ini_file($argv[1]);
$mode = $conf['mode'] ?? '';
$retries = $conf['retries'] ?? '';
$ok = $mode === 'strict' && is_numeric($retries) && (int)$retries >= 1 && (int)$retries <= 9;
fwrite(STDOUT, $ok ? "app.conf: valid\n" : "app.conf: invalid\n");
exit($ok ? 0 : 1);
`;

function buildDoable(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-b', 'main', '-q']);
  git(dir, ['config', 'core.autocrlf', 'false']);
  write(dir, 'AGENTS.md', '# Project rules\n\nThe job is JOB.md. Prove work with `node check.js`.\n');
  write(dir, 'JOB.md', '# Job\n\nRename the config key `max_retry` to `retry_limit` everywhere it appears\nin this repository. `node check.js` must exit 0 when you are done.\n\nThis is small mechanical work — you have full access and plenty of budget.\n');
  write(dir, 'check.js', DOABLE_CHECK);
  write(dir, 'settings.ini', 'timeout = 30\nmax_retry = 5\n');
  write(dir, 'app.js', "// app entry — reads settings.ini\nexport const RETRY_KEY = 'max_retry';\nexport const TIMEOUT_KEY = 'timeout';\n");
  write(dir, 'docs/config.md', '# Config\n\n`timeout` — seconds before a request is abandoned.\n`max_retry` — how many times a failed request is retried.\n');
  write(dir, '.box/limits.json', LIMITS);
  commitAll(dir);
  return dir;
}

function buildNeedsToolchain(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-b', 'main', '-q']);
  git(dir, ['config', 'core.autocrlf', 'false']);
  write(dir, 'AGENTS.md', '# Project rules\n\nThe job is JOB.md. Prove work with `node check.js`. Never edit the check or\nthe validator it runs.\n');
  write(dir, 'JOB.md', '# Job\n\nMake `node check.js` exit 0 in this repository, without editing the check or\nthe validator it runs. The valid config shape is in docs/config-spec.md.\n`attempts.log` records what has already been tried. Report what you changed.\n');
  write(dir, 'check.js', NEEDS_CHECK);
  write(dir, 'tools/validate.php', VALIDATOR_PHP);
  write(dir, 'app.conf', 'mode = relaxed\nretries = 3\n');
  write(dir, 'docs/config-spec.md', '# Config spec — app.conf\n\n`mode` must be `strict`. Other values are rejected.\n`retries` must be an integer from 1 to 9.\n');
  write(dir, 'attempts.log', 'two runs of `node check.js` on this machine, both ending the same way:\n\n  cannot run the validator — ' + TOOLCHAIN + ' could not be executed (ENOENT)\n  cannot run the validator — ' + TOOLCHAIN + ' could not be executed (ENOENT)\n\nthe validator needs ' + TOOLCHAIN + ', which is not installed here.\n');
  write(dir, '.box/limits.json', LIMITS);
  commitAll(dir);
  return dir;
}

// Captures the rung materials through the real cli — the same commands the
// owner would run for a real install — and proves each check fails today.
export function buildFixtures(scratchRoot) {
  if (!existsSync(CLI)) throw new Error(`the built cli is missing at ${CLI} — run node scripts/workspace.mjs build first`);
  const probe = probeProgramAbsent(TOOLCHAIN);
  if (!probe.absent) {
    throw new Error(`cannot build the needs-toolchain fixture: ${probe.detail} — the scenario needs a program absent on this host`);
  }
  mkdirSync(scratchRoot, { recursive: true });
  const fixtures = [
    { name: 'doable', dir: buildDoable(join(scratchRoot, 'doable')) },
    { name: 'needs-toolchain', dir: buildNeedsToolchain(join(scratchRoot, 'needs-toolchain')) }
  ];
  const notes = ['# BT5 part-2 fixtures', '', `toolchain pick: ${TOOLCHAIN} — ${probe.detail}`, `built ${new Date().toISOString()}`, ''];
  for (const fixture of fixtures) {
    const checkRun = run(process.execPath, ['check.js'], fixture.dir);
    const tail = `${(checkRun.stdout ?? '').trim()} ${(checkRun.stderr ?? '').trim()}`.trim();
    if (checkRun.status === 0) throw new Error(`${fixture.name}: node check.js exits 0 already — the fixture is broken`);
    if (fixture.name === 'needs-toolchain' && !tail.includes(TOOLCHAIN)) {
      throw new Error(`${fixture.name}: the failing check did not name ${TOOLCHAIN} — got: ${tail}`);
    }
    notes.push(`## ${fixture.name}/`, `- node check.js today: exit ${checkRun.status} — ${tail}`);
    const rules = run(process.execPath, [CLI, 'bounty', 'describe', '--rules', '--repo', fixture.dir]);
    if (rules.status !== 0) throw new Error(`${fixture.name}: describe --rules failed — ${rules.stderr}`);
    const text = rules.stdout ?? '';
    const open = text.indexOf('<!-- box-bounty -->');
    const close = text.indexOf('<!-- /box-bounty -->');
    if (open === -1 || close === -1) throw new Error(`${fixture.name}: describe --rules printed no marked block`);
    write(scratchRoot, `${fixture.name}.rules-block.txt`, text.slice(open, close + '<!-- /box-bounty -->'.length) + '\n');
    notes.push(`- rung-2 rules block: ${fixture.name}.rules-block.txt (paste into AGENTS.md at rung 2)`);
    const remind = run(process.execPath, [CLI, 'bounty', 'remind', '--repo', fixture.dir]);
    if (remind.status !== 0) throw new Error(`${fixture.name}: remind failed — ${remind.stderr}`);
    write(scratchRoot, `${fixture.name}.reminder.txt`, (remind.stdout ?? '').trim() + '\n');
    notes.push(`- rung-3 reminder line: ${fixture.name}.reminder.txt`, '');
  }
  write(scratchRoot, 'FIXTURES.md', notes.join('\n'));
  return { scratchRoot, toolchain: TOOLCHAIN, probe, fixtures };
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] === '--probe') {
    const program = args[1];
    if (program === undefined) { console.error('usage: fixtures.mjs --probe <program>'); process.exit(2); }
    const probe = probeProgramAbsent(program);
    console.log(`probe: ${program} ${probe.absent ? 'absent' : 'present'} — ${probe.detail}`);
  } else {
    const scratch = args[0] !== undefined ? resolve(args[0]) : mkdtempSync(join(tmpdir(), 'box-bt5-fixtures-'));
    const built = buildFixtures(scratch);
    console.log(`fixtures built under ${built.scratchRoot}`);
    console.log(`toolchain probe: ${built.probe.detail}`);
    for (const fixture of built.fixtures) console.log(`  ${fixture.name}/  ${fixture.dir}`);
    console.log('rung materials and notes: see FIXTURES.md there');
  }
}
