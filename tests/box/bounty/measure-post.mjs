// BT6a evidence fixture — the real cost of posting one bounty, measured
// against a local bare remote standing in for github.com, on this repository's
// real state. Not a test: run it by hand and paste the numbers into the wave's
// Result.
//
//   node tests/box/bounty/measure-post.mjs [repo]
//
// Three runs each of three pushes, each run against a fresh bare remote. The
// old way posted to a repository GitHub had just created — empty — so its
// remote is unseeded; the new way posts to the repository that already holds
// the code, so its remote is seeded with HEAD (the "code already on GitHub",
// not part of the measurement):
//
//   before   the old way: one parentless commit of the whole shipped snapshot
//            (index add -A minus the never-ship pathspecs, approximating the
//            manifest's shipped set)
//   after    nothing local needed: the bounty branch is a name for the commit
//            the remote already has — the measured push should upload ~0
//   after+wip a small uncommitted change the task needs: one tool-built commit
//            on top of HEAD — the measured push uploads only that commit
//
// Bytes uploaded are the thin pack send-pack builds — objects on the new tip
// minus everything the remote's refs already reach. Time is the wall-clock of
// the measured push alone. Nothing here touches the repository's worktree,
// index or HEAD; the only writes are loose objects in the repo's store and
// wave-named temp dirs.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = (process.argv[2] ?? fileURLToPath(new URL('../../../', import.meta.url))).replace(/[\\/]+$/, '');
const BS = String.fromCharCode(92);
const env = extra => ({ ...process.env, GIT_OPTIONAL_LOCKS: '0', ...extra });
const git = (dir, args, extra = {}) => {
  const run = spawnSync('git', ['-c', `safe.directory=${String(dir).replaceAll(BS, '/')}`, '-C', dir, ...args], { encoding: 'utf8', env: env(extra) });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${run.stderr || run.stdout}`);
  return run.stdout.trim();
};

// The never-ship table as index pathspecs — close enough to the manifest's
// shipped set for a cost measurement (the real manifest also folds owner
// .boxignore patterns).
const NEVER_SHIP_PATHSPECS = [
  ':(glob)**/.env', ':(glob)**/.env.*', ':(glob)**/*.env', ':(glob)**/.envrc*',
  ':(glob)**/*secrets*/**', ':(glob)**/.runtime/**', ':(glob)**/.box/**', ':(glob)**/.git/**',
  ':(glob)**/*.key', ':(glob)**/*.pem', ':(glob)**/*.p12', ':(glob)**/*.pfx', ':(glob)**/*.jks', ':(glob)**/*.keystore', ':(glob)**/*.ppk', ':(glob)**/*.gpg',
  ':(glob)**/*.crt', ':(glob)**/*.cer', ':(glob)**/*.der', ':(glob)**/*.cert', ':(glob)**/*.p7b', ':(glob)**/*.p7c', ':(glob)**/*.asc',
  ':(glob)**/.netrc', ':(glob)**/.pgpass', ':(glob)**/.htpasswd', ':(glob)**/.git-credentials', ':(glob)**/.npmrc', ':(glob)**/.pypirc', ':(glob)**/.dockercfg', ':(glob)**/.yarnrc', ':(glob)**/.yarnrc.yml',
  ':(glob)**/.aws/credentials', ':(glob)**/.docker/config.json',
  ':(glob)**/id_rsa*', ':(glob)**/id_dsa*', ':(glob)**/id_ecdsa*', ':(glob)**/id_ed25519*'
];

const buildSnapshot = (indexFile) => {
  const index = { GIT_INDEX_FILE: indexFile };
  git(repo, ['read-tree', 'HEAD'], index);
  // add -A folds uncommitted changes and untracked non-ignored files — the
  // working state as it stands, the snapshot the old code shipped.
  git(repo, ['add', '-A'], index);
  git(repo, ['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', ...NEVER_SHIP_PATHSPECS], index);
  const tree = git(repo, ['write-tree'], index);
  return git(repo, ['-c', 'user.name=box-bounty', '-c', 'user.email=box-bounty@localhost', 'commit-tree', tree, '-m', 'box bounty measure before'], index);
};

const buildWip = (indexFile) => {
  const index = { GIT_INDEX_FILE: indexFile };
  git(repo, ['read-tree', 'HEAD'], index);
  // A small uncommitted change the task needs — one modified tracked file,
  // landed through plumbing like the tool's work-in-progress commit.
  const run = spawnSync('git', ['-c', `safe.directory=${repo.replaceAll(BS, '/')}`, '-C', repo, 'hash-object', '-w', '--stdin'], { input: 'a small change the task needs\n', encoding: 'utf8', env: env({}) });
  if (run.status !== 0) throw new Error(`hash-object failed: ${run.stderr}`);
  git(repo, ['update-index', '--add', '--cacheinfo', `100644,${run.stdout.trim()},README.md`], index);
  const tree = git(repo, ['write-tree'], index);
  const dates = { GIT_AUTHOR_DATE: '2026-10-11T00:00:00Z', GIT_COMMITTER_DATE: '2026-10-11T00:00:00Z' };
  return git(repo, ['-c', 'user.name=box-bounty', '-c', 'user.email=box-bounty@localhost', 'commit-tree', tree, '-p', 'HEAD', '-m', 'box bounty measure: work in progress'], { ...index, ...dates });
};

const RUNS = 3;
// Each measured push gets a fresh bare remote. The old way posted to a
// repository GitHub had just created — empty, nothing to dedupe against —
// so its remote is unseeded. The new way posts to the repository that
// already holds the code, so its remote is seeded with HEAD; the seed is
// the "code already on GitHub" and is not part of the measurement.
const freshRemote = (seed) => {
  const dir = mkdtempSync(join(tmpdir(), 'box-bt6a-measure-'));
  const bare = join(dir, 'remote.git');
  git(repo, ['init', '--bare', '-q', bare]);
  if (seed) git(repo, ['push', '-q', bare, 'HEAD:refs/heads/main']);
  return { dir, bare };
};

// The bytes that would cross the wire: the thin pack send-pack builds —
// objects on the new tip minus everything the remote's refs already reach.
// Local pushes do the same negotiation, so this is what would cross the wire
// to github.com as well.
const packBytes = (bare, tip) => {
  const have = git(bare, ['for-each-ref', '--format=%(objectname)']).split('\n').filter(Boolean);
  const run = spawnSync('git', ['-c', `safe.directory=${repo.replaceAll(BS, '/')}`, '-C', repo, 'pack-objects', '--stdout', '--revs', '--thin', '--delta-base-offset'], {
    input: [tip, ...have.map(ref => `^${ref}`)].join('\n') + '\n',
    maxBuffer: 256 * 1024 * 1024, env: env({})
  });
  if (run.status !== 0) throw new Error(`pack-objects failed: ${run.stderr}`);
  return run.stdout.length;
};

const measurePush = (bare, refspec) => {
  const tip = refspec.split(':')[0];
  const bytes = packBytes(bare, tip);
  const started = performance.now();
  git(repo, ['push', '-q', bare, refspec]);
  const ms = performance.now() - started;
  return { ms, bytes };
};

const head = git(repo, ['rev-parse', 'HEAD']);
const work = mkdtempSync(join(tmpdir(), 'box-bt6a-measure-index-'));
const snapshot = buildSnapshot(join(work, 'snapshot.index'));
const wip = buildWip(join(work, 'wip.index'));
const shipped = git(repo, ['ls-tree', '-r', '--name-only', snapshot]).split('\n').filter(Boolean);

const cases = [
  { name: 'before: whole shipped snapshot in one commit', ref: `${snapshot}:refs/heads/box-bounty/measure`, seed: false },
  { name: 'after: nothing local needed', ref: `${head}:refs/heads/box-bounty/measure`, seed: true },
  { name: 'after: one small uncommitted change', ref: `${wip}:refs/heads/box-bounty/measure`, seed: true }
];

console.log(`repository: ${repo}`);
console.log(`HEAD: ${head}`);
const snapshotBytes = shipped.reduce((sum, path) => sum + Number(git(repo, ['cat-file', '-s', `${snapshot}:${path}`])), 0);
console.log(`snapshot shipped set: ${shipped.length} files, ${snapshotBytes} blob bytes`);
console.log('');

for (const item of cases) {
  const runs = [];
  for (let n = 0; n < RUNS; n += 1) {
    const remote = freshRemote(item.seed);
    try { runs.push(measurePush(remote.bare, item.ref)); }
    finally { rmSync(remote.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); }
  }
  const ms = runs.map(run => Math.round(run.ms));
  const bytes = runs.map(run => run.bytes);
  const spread = values => `${Math.min(...values)}–${Math.max(...values)} (median ${values.sort((a, b) => a - b)[1]})`;
  console.log(item.name);
  console.log(`  time:  ${spread(ms)} ms`);
  console.log(`  bytes: ${spread(bytes)}`);
}

rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
