import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { BountyRefused } from './errors.js';
import { gitBlob, gitOutcome, ownerGitOutcome } from './git.js';
import type { BountyManifest } from './manifest.js';
import { BUILTIN_RULES, publishListed, publishLists, shipRules } from './never-ship.js';
import type { NeverShipRule } from './never-ship.js';
import { looksBinary, scanText } from './github.js';
import type { ScanHit } from './github.js';
import { canonicalForNew, writeNewRecord } from './record.js';
import { readDecision, repoReward } from './settings.js';
import { requireRepository } from './repository.js';
import { createSnapshot } from './snapshot.js';
import type { SnapshotFile, SnapshotRemoval } from './snapshot.js';

// `bounty create` in two phases so the preview always comes first and a refused
// bounty never leaves a folder behind:
//   planBounty     — resolve the repository, pin the working state in a snapshot
//                    commit, and classify every file; writes nothing but Git objects.
//   finalizeBounty — emit the folder into sibling staging, then rename into
//                    place. Refusal = no folder.
//
// Checks were removed on 11 October 2026: a bounty is the task, the note, the
// why and the code. Create neither accepts nor runs a command — nothing a
// solver wrote is ever run by this tool.

export const TOOL_VERSION = 'box-bounty@0.1.0';
const PREVIEW_NAMES_PER_RULE = 20;

export interface CreateOptions {
  readonly resumeNote?: string;
  readonly repoPath: string;
  /** `--why "<one line>"`: why this is being handed off — required. It lives
      only in the record (like --job), never in bounty.json, the listing or
      the shipped folder, so the reasons for handing off can be learned. */
  readonly why: string;
  /** `--title`: absent or blank, the title is the task's first non-empty line. */
  readonly title?: string;
  readonly taskPath: string;
  readonly notePath?: string;
  /** `--job <file>`: owner context — the larger piece of work waiting on this
      bounty. Its text lives only in the record; never in bounty.json, the
      listing or the shipped folder. */
  readonly jobPath?: string;
  /** `--out`: absent, the folder goes to a sibling `bounties/<slug>` directory
      next to the repository root — always outside the checkout. */
  readonly outDir?: string;
}

export type PlanFile = SnapshotFile;
export interface RuleRemoval { readonly rule: string; readonly removed: number; readonly paths: readonly string[] }

export interface BountyPlan {
  readonly resume: import('./record.js').ResumeContext;
  readonly repoRoot: string;
  readonly title: string;
  /** True when deriveTitle shortened the raw text — the preview then states
      the rule so the issue's title is never a surprise. */
  readonly titleShortened: boolean;
  /** One line of why — record only, never shipped. */
  readonly why: string;
  readonly task: { readonly file: string; readonly text: string };
  readonly note: { readonly file: string; readonly text: string } | null;
  readonly job: { readonly file: string; readonly text: string } | null;
  readonly snapshot: { readonly commit: string; readonly tree: string; readonly baseCommit: string | null };
  /** Canonical paths that exist as blobs in the snapshot tree — their emitted
      bytes come from `commit:path`, never the live worktree. */
  readonly snapshotBlobs: ReadonlySet<string>;
  /** Paths that are gitlinks (submodules) in the snapshot tree, as spelled by
      git — never blobs, so a moved submodule HEAD is not a deleted file. */
  readonly snapshotLinks: ReadonlySet<string>;
  readonly files: readonly PlanFile[];
  readonly removed: readonly SnapshotRemoval[];
  readonly ruleRemovals: readonly RuleRemoval[];
  readonly totalBytes: number;
  /** The create-time scan (BT8c): the shipped set — what a folder post
      publishes, and a superset of what a GitHub post publishes for the
      first time — read for the same secret shapes the post scan watches.
      A hit at create holds nothing; it is recorded on the record the same
      way. `suppressed` counts hits on owner safe-listed paths; `binary`
      names files Git would treat as binary — they were not scanned. */
  readonly scan: { readonly hits: readonly ScanHit[]; readonly suppressed: number; readonly binary: readonly string[]; readonly filesScanned: number };
  readonly outDir: string;
}

export interface BountyResult {
  readonly id: string;
  readonly outDir: string;
  readonly plan: BountyPlan;
  /** Absolute path of the `.box/bounties/<id>.json` record written into the
      repository — the tool writes it; committing it is the agent's flow. */
  readonly recordPath: string;
}

const sha256 = (buffer: Buffer | string): string => createHash('sha256').update(buffer).digest('hex');

const toPosixPath = (path: string): string => path.split('\\').join('/');

function readTextFile(path: string, reason: string, repoRoot: string, rules: readonly NeverShipRule[]): { file: string; text: string } {
  const absolute = resolve(path);
  if (!statSync(absolute, { throwIfNoEntry: false })?.isFile()) {
    throw new BountyRefused(reason, `file ${path} does not exist — pass a readable file`);
  }
  // The file's bytes are embedded verbatim into the bounty — a never-ship path
  // is refused here exactly as it would be inside the snapshot. Inside the repo
  // the check runs on the canonical repo-relative path (all owner rules apply);
  // outside it only the built-ins apply, judged on the canonical absolute path.
  const real = realpathSync(absolute);
  const offset = toPosixPath(relative(repoRoot, real));
  const inside = !(offset === '' || offset.startsWith('../') || offset === '..' || isAbsolute(offset));
  const key = (inside ? offset : toPosixPath(real)).toLowerCase();
  const matched = (inside ? rules : BUILTIN_RULES).find(rule => rule.match(key));
  if (matched !== undefined) {
    throw new BountyRefused('never-ship-input', `${path} resolves to ${inside ? offset : real}, which the never-ship rule '${matched.name}' removes — task and note files must be safe to embed. They may sit anywhere outside the never-ship paths — inside the repository or outside it, committed or not`);
  }
  const text = readFileSync(absolute, 'utf8');
  if (text.trim() === '') throw new BountyRefused(reason, `file ${path} is empty — a bounty needs real content`);
  return { file: inside ? offset : basename(real), text };
}

// What a bounty title is made of (BT14, F4): one short line, stated in the
// preview whenever the raw text was shortened. A leading markdown '#' is
// dropped, the text stops at the first sentence, and it is kept to
// TITLE_LIMIT characters — an issue titled by a whole paragraph read worse
// than one cut to a sentence.
export const TITLE_LIMIT = 80;
export function deriveTitle(raw: string): { readonly title: string; readonly shortened: boolean } {
  const given = raw.trim();
  let title = given.replace(/^#+\s*/, '').trim();
  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(title);
  if (sentence !== null) title = sentence[1]!;
  if (title.length > TITLE_LIMIT) title = `${title.slice(0, TITLE_LIMIT).trimEnd()}…`;
  return { title, shortened: title !== given };
}

export function resolveRepoRoot(repoPath: string, command?: string): string {
  const repo = resolve(repoPath);
  const top = gitOutcome(repo, ['rev-parse', '--show-toplevel']);
  if (top.status !== 0 || top.stdout.trim() === '') {
    const verb = command !== undefined ? `box bounty ${command}` : 'box bounty';
    throw new BountyRefused('not-a-repository', `${repo} is not inside a Git checkout — ${verb} needs a repository to work in`);
  }
  return realpathSync(top.stdout.trim());
}

// The default place to write: `bounties/<slug>` NEXT TO the repository root —
// never inside it (a folder inside the checkout would ship inside the next
// bounty; the containment check below still runs on whatever this resolves to)
// and close enough that an agent finds it again. The slug is the title folded
// to [a-z0-9-]; anything that leaves no characters becomes 'bounty'.
function defaultOutDir(repoRoot: string, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'bounty';
  return join(dirname(repoRoot), 'bounties', slug);
}

export function planBounty(options: CreateOptions): BountyPlan {
  const why = options.why.trim();
  if (why === '') {
    throw new BountyRefused('missing-why', 'create needs one line of why — pass --why "<why this is handed off>". It is kept only in the record, never shipped, so the reasons for handing off can be learned from use');
  }
  const repoRoot = resolveRepoRoot(options.repoPath, 'create');
  const rules = [...shipRules(repoRoot)];
  const task = readTextFile(options.taskPath, 'missing-task', repoRoot, rules);
  const note = options.notePath !== undefined ? readTextFile(options.notePath, 'missing-note', repoRoot, rules) : null;
  const job = options.jobPath !== undefined ? readTextFile(options.jobPath, 'missing-job', repoRoot, rules) : null;
  // The title comes from the task when none is given: its first non-empty
  // line's first sentence, as deriveTitle states it. --title still wins
  // when supplied — and is shortened by the same stated rule.
  const derived = deriveTitle((options.title ?? '').trim()
    || task.text.split('\n').map(line => line.trim()).find(line => line !== '')!);
  const title = derived.title;
  // canonicalForNew realpaths the nearest EXISTING ancestor: a nonexistent
  // --out under a junction pointing into the repository resolves to its real
  // inside-the-repo path and is refused below instead of slipping past.
  const outDir = canonicalForNew(resolve(options.outDir ?? defaultOutDir(repoRoot, title)));
  const rootKey = `${toPosixPath(repoRoot).toLowerCase()}/`;
  const outKey = `${toPosixPath(outDir).toLowerCase()}/`;
  if (outKey === rootKey || outKey.startsWith(rootKey)) {
    throw new BountyRefused('out-inside-repo', `--out ${options.outDir ?? outDir} lands inside the repository — a bounty folder placed there would ship inside the next bounty. Point --out outside the checkout`);
  }

  const workDir = mkdtempSync(join(tmpdir(), 'box-bt1-snap-'));
  let snapshot: ReturnType<typeof createSnapshot>;
  try {
    snapshot = createSnapshot(repoRoot, workDir, rules);
  } finally {
    rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }

  const files: PlanFile[] = [...snapshot.files];
  const removed = snapshot.removed;
  // The create-time scan (BT8c): the shipped set is what a folder post
  // publishes — and a GitHub post's first-published set is a subset of it —
  // so it is read for the same secret shapes the post scan watches. A hit
  // holds nothing here and is recorded on the record, so the agent can fix
  // the flagged content before post. A file Git would call binary (a NUL in
  // the head) is named as not scanned — a fact, never a hold; the owner's
  // never publish list is the way to keep such a file out.
  const publish = publishLists(repoRoot);
  const found: ScanHit[] = [];
  const scanBinary: string[] = [];
  for (const file of files) {
    try {
      const bytes = readFileSync(join(repoRoot, ...file.path.split('/')));
      if (looksBinary(bytes)) { scanBinary.push(file.path); continue; }
      found.push(...scanText(file.path, bytes.toString('utf8')));
    } catch {
      // A file that cannot be read back ships by its recorded hash; the
      // post scan reads the first-published bytes anyway.
    }
  }
  const scanHits = found.filter(hit => !publishListed(publish.safe, hit.path));
  const scan = { hits: scanHits, suppressed: found.length - scanHits.length, binary: scanBinary, filesScanned: files.length - scanBinary.length };
  const ruleRemovals: RuleRemoval[] = rules
    .map(rule => ({ rule: rule.name, paths: removed.filter(entry => entry.rule === rule.name).map(entry => entry.path) }))
    .filter(entry => entry.paths.length > 0)
    .map(entry => ({ rule: entry.rule, removed: entry.paths.length, paths: entry.paths.sort() }));

  return {
    repoRoot,
    resume: {
      kind: 'recorded',
      branch: gitOutcome(repoRoot, ['symbolic-ref', '--short', 'HEAD']).stdout.trim() || '(detached HEAD)',
      commit: snapshot.baseCommit ?? '(no commits yet)',
      changed: [...new Set([
        ...ownerGitOutcome(repoRoot, ['diff', '--name-only', '--no-renames', '-z', ...(snapshot.baseCommit === null ? [] : ['HEAD'])]).stdout.split('\0').filter(Boolean),
        ...ownerGitOutcome(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z']).stdout.split('\0').filter(Boolean)
      ])].filter(path => !path.startsWith('.box/bounties/')).sort(),
      note: options.resumeNote?.trim() || null
    },
    title,
    titleShortened: derived.shortened,
    why,
    task,
    note,
    job,
    snapshot: { commit: snapshot.commit, tree: snapshot.tree, baseCommit: snapshot.baseCommit },
    snapshotBlobs: snapshot.blobs,
    snapshotLinks: snapshot.links,
    files,
    removed,
    ruleRemovals,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    scan,
    outDir
  };
}

// The licence fact the listing and the manifest state: whether the shipped set
// carries a licence file at the repository root and its name, plus the licence
// a shipped package.json declares. A stated fact, never a promise.
const LICENCE_NAME = /^licen[cs]e([._ -].*)?$/i;

export function licenceOf(manifest: BountyManifest): { file: string | null; declared: string | null } {
  if (manifest.licence !== undefined) return manifest.licence;
  // Manifests written before this wave carry no licence key — derive the file
  // name from the shipped list; nothing more can be known.
  const file = manifest.files.find(entry => !entry.path.includes('/') && LICENCE_NAME.test(entry.path))?.path ?? null;
  return { file, declared: null };
}

export function renderListing(manifest: BountyManifest, note: { file: string; text: string } | null, reward: number): string {
  const licence = licenceOf(manifest);
  const lines: string[] = [];
  lines.push(`# Bounty: ${manifest.title}`);
  lines.push('');
  lines.push(`id ${manifest.id} · created ${manifest.createdAt} by ${manifest.tool}`);
  lines.push('');
  lines.push('## What is wanted');
  lines.push('');
  lines.push(manifest.task.text.trim());
  lines.push('');
  if (note !== null) {
    lines.push('## What was already tried');
    lines.push('');
    lines.push(note.text.trim());
    lines.push('');
  }
  lines.push('## The code');
  lines.push('');
  lines.push('`repo/` holds a snapshot of the repository as it stood when the bounty was');
  lines.push('created — the full working state, minus files that never ship (secrets, keys,');
  lines.push('anything the owner listed). There is no `.git` and no history.');
  lines.push('');
  lines.push('## What was kept out');
  lines.push('');
  if (manifest.neverShip.every(rule => rule.removed === 0)) {
    lines.push('No files were removed by the never-ship rules.');
  } else {
    lines.push(`${manifest.counts.removed} file(s) were removed by built-in and owner-listed never-ship`);
    lines.push('rules before packaging. Their names are not listed here by design.');
  }
  lines.push('');
  lines.push('## How to answer');
  lines.push('');
  lines.push('Answers come back through the tool that posted this bounty; `bounty.json` in');
  lines.push('this folder is the machine-readable record of everything above and must come');
  lines.push('back untouched. Nothing in an answer is ever run — the poster reads the');
  lines.push('change and decides.');
  lines.push('');
  lines.push(`reward: $${reward}`);
  if (reward > 0) lines.push('payment is the poster\'s to make by hand — posting an answer does not guarantee it.');
  lines.push(licence.file !== null
    ? `licence: ${licence.file}${licence.declared !== null ? ` (package.json declares ${licence.declared})` : ''}`
    : 'licence: no licence file was found in the shipped set');
  lines.push('');
  return lines.join('\n');
}

export function renderPreview(plan: BountyPlan): string {
  const lines: string[] = [];
  lines.push('box bounty create — preview of what would leave');
  lines.push(`  repository: ${plan.repoRoot}`);
  lines.push(`  snapshot: commit ${plan.snapshot.commit} (tree ${plan.snapshot.tree}, base ${plan.snapshot.baseCommit ?? 'none — unborn HEAD'})`);
  lines.push(`  would ship: ${plan.files.length} file(s), ${plan.totalBytes} bytes`);
  if (plan.scan.hits.length === 0) {
    lines.push(`  pre-publish scan of the shipped set: clean — ${plan.scan.filesScanned} file(s) read`);
  } else {
    lines.push(`  pre-publish scan of the shipped set: ${plan.scan.hits.length} secret-shaped hit(s) — a post would wait for the owner:`);
    for (const hit of plan.scan.hits) lines.push(`    ${hit.path}:${hit.line} — ${hit.rule}`);
  }
  if (plan.scan.suppressed > 0) lines.push(`    ${plan.scan.suppressed} hit(s) sit on paths the owner listed safe to publish — not held`);
  if (plan.scan.binary.length > 0) lines.push(`    not scanned — Git would treat them as binary: ${plan.scan.binary.slice(0, PREVIEW_NAMES_PER_RULE).join(', ')}${plan.scan.binary.length > PREVIEW_NAMES_PER_RULE ? ` … and ${plan.scan.binary.length - PREVIEW_NAMES_PER_RULE} more` : ''}`);
  if (plan.removed.length === 0) {
    lines.push('  never-ship removed: nothing');
  } else {
    lines.push(`  never-ship removed: ${plan.removed.length} file(s)`);
    for (const entry of plan.ruleRemovals) {
      lines.push(`    ${entry.rule}: ${entry.removed}`);
      for (const path of entry.paths.slice(0, PREVIEW_NAMES_PER_RULE)) lines.push(`      ${path}`);
      if (entry.paths.length > PREVIEW_NAMES_PER_RULE) lines.push(`      … and ${entry.paths.length - PREVIEW_NAMES_PER_RULE} more`);
    }
  }
  lines.push(`  title: ${plan.title}${plan.titleShortened ? ` (shortened — a leading # and anything past the first sentence or ${TITLE_LIMIT} characters are dropped)` : ''}`);
  lines.push(`  why: ${plan.why} (record only — never shipped)`);
  lines.push(`  reward: $${repoReward(plan.repoRoot).amount} in force now for this repository — a posted bounty states the amount in force at posting`);
  // The post's owner gate, stated at create (BT14): an agent that learns it
  // here is not surprised when post waits.
  let permission = 'no GitHub remote — only a folder post is possible from this repository';
  try {
    const address = requireRepository(plan.repoRoot);
    const decision = readDecision(plan.repoRoot).decision;
    permission = decision === 'allowed'
      ? 'allowed — a GitHub post goes out'
      : decision === 'ask'
        ? 'ask me each time — a GitHub post waits for the owner\'s answer'
        : `none — a GitHub post waits for the owner's permission; box bounty allow ${address} is their answer`;
  } catch { /* an unlistable repository keeps the folder-post fact */ }
  lines.push(`  posting permission: ${permission}`);
  lines.push(`  task: ${plan.task.file}`);
  for (const line of plan.task.text.trim().split('\n')) lines.push(`    ${line}`);
  if (plan.note !== null) lines.push(`  note: ${plan.note.file}`);
  else lines.push('  note: written by the tool from the changed files (no --note)');
  if (plan.job !== null) lines.push(`  job: ${plan.job.file} (record only — never shipped)`);
  lines.push(`  out: ${plan.outDir}`);
  lines.push('  task, note and job files stay where they are — they may sit anywhere outside the never-ship paths; the tool reads them and never commits or removes them');
  return lines.join('\n');
}

// When no --note was given, the note writes itself from evidence the tool
// gathers: the files the working state already changed relative to the
// snapshot's base commit. The note SHIPS — a changed path is named only when it
// is part of the shipped set or, for a file the working state deleted, when no
// never-ship rule would have kept it out — so a removed never-ship name can
// never be named inside the bounty. Both judgements run on the canonical path,
// the same one shipping was decided on — never the diff's tree spelling.
// Gathering never crashes create: a repository with nothing to report gets a
// plain note, and a failed read falls back to one too.
function composeNote(plan: BountyPlan): { file: string; text: string } {
  const lines: string[] = ['written by the tool — no --note was supplied.'];
  try {
    if (plan.snapshot.baseCommit === null) {
      lines.push('', 'the repository has no commits yet — every shipped file is new work.');
    } else {
      // Classification speaks canonical paths for what LIVES and base-tree
      // spellings for what is GONE. Shipping and the never-ship rules were
      // decided on realpath-resolved names, so a file tracked through a
      // junction (jdir/f.py) ships as realdir/f.py and is classified by what
      // it resolves to; canonicalForNew plays the same trick it does for
      // --out/--to, realpathing the nearest EXISTING ancestor. But a deleted
      // path can only resolve through whatever occupies the spelling NOW — a
      // junction planted where the file was would redirect every fact about
      // the deletion to the link's target — so deletions are judged by the
      // base tree's own spellings, the names the owner knows.
      const realRoot = plan.repoRoot; // already canonical — resolveRepoRoot realpaths it
      const canonicalDiffPath = (name: string): string | null => {
        const offset = toPosixPath(relative(realRoot, canonicalForNew(join(realRoot, ...name.split('/')))));
        return offset === '' || offset.startsWith('../') || offset === '..' || isAbsolute(offset) ? null : offset;
      };
      const shipped = new Map(plan.files.map(file => [file.path.toLowerCase(), file.path]));
      const rules = shipRules(plan.repoRoot);
      // --no-renames: rename detection folds a paired delete+add into one
      // line naming only the target (`git mv a.py .env` emits just `.env`),
      // which would hide the shipped file the working state lost.
      const diff = gitOutcome(plan.repoRoot, ['diff', '--name-only', '-z', '--no-renames', plan.snapshot.baseCommit, plan.snapshot.commit]);
      if (diff.status !== 0) throw new Error(`git diff failed: ${diff.stderr.trim()}`);
      // The base tree's blob spellings — the names the owner committed. -c
      // core.quotepath=false keeps non-ASCII names unquoted, as in the
      // snapshot's own ls-tree.
      const baseBlobs = new Set<string>();
      const baseListing = gitOutcome(plan.repoRoot, ['-c', 'core.quotepath=false', 'ls-tree', '-r', '-z', '--format=%(objecttype) %(path)', plan.snapshot.baseCommit]);
      if (baseListing.status !== 0) throw new Error(`git ls-tree failed: ${baseListing.stderr.trim()}`);
      for (const record of baseListing.stdout.split('\0')) {
        if (record.startsWith('blob ')) baseBlobs.add(record.slice(5));
      }
      const baseBlobsLower = new Set([...baseBlobs].map(path => path.toLowerCase()));
      // Fates: a gitlink still in the snapshot tree is a moved submodule,
      // named as one. A diff name that is itself a base blob is judged by its
      // SPELLING before any live canonicalisation: a rule-covered spelling
      // still suppresses (`.env` names stay out); a spelling absent from the
      // snapshot's blobs is a deletion — named by its base spelling, never
      // resolved through live ancestors; and a spelling that survives only as
      // a modified blob resolving onto ANOTHER base-tracked path is a junction
      // replacement — the file no longer exists as itself in the shipped set,
      // so it is named deleted by the same judgement (a rule-covered
      // *canonical* must never suppress a rule-free base spelling's change).
      // Only a base spelling that still stands on its own falls through to
      // live canonicalisation — a stable junction's canonical was never a
      // base path, which is what tells it from a post-base replacement.
      // Anything else — an addition, or a live path under a new spelling — is
      // canonicalised and named under what it ships as, unless it is a
      // rule-covered name (unlisted) or a new spelling of a base-tracked file
      // (a junction repopulating a tracked dir adds a diff line whose
      // canonical is an unchanged real file — the file itself reports, or
      // nothing changed).
      const named = new Set<string>();
      let unlisted = false;
      const diffNames = new Set<string>();
      for (const name of diff.stdout.split('\0')) {
        if (name === '') continue;
        diffNames.add(name);
        if (plan.snapshotLinks.has(name)) { named.add(`${name} (submodule changed)`); continue; }
        if (baseBlobs.has(name)) {
          if (rules.some(rule => rule.match(name.toLowerCase()))) { unlisted = true; continue; }
          if (!plan.snapshotBlobs.has(name)) { named.add(`${name} (deleted)`); continue; }
          const asItself = shipped.get(name.toLowerCase());
          if (asItself !== undefined) { named.add(asItself); continue; }
          const redirect = canonicalDiffPath(name);
          if (redirect !== null && redirect.toLowerCase() !== name.toLowerCase() && baseBlobsLower.has(redirect.toLowerCase())) {
            named.add(`${name} (deleted)`); // replaced: the spelling resolves onto another base file
            continue;
          }
        }
        const canonical = canonicalDiffPath(name);
        const key = (canonical ?? name).toLowerCase();
        const shippedAs = canonical !== null ? shipped.get(key) : undefined;
        if (shippedAs !== undefined) {
          if (key === name.toLowerCase() || !baseBlobsLower.has(key)) named.add(shippedAs);
          continue;
        }
        if (rules.some(rule => rule.match(key) || rule.match(name.toLowerCase()))) { unlisted = true; continue; }
        if (plan.snapshotBlobs.has(name)) { unlisted = true; continue; }
        named.add(`${canonical ?? name} (deleted)`);
      }
      // A deletion the diff cannot show: `add -A` repopulates a spelling
      // through a replacement junction (identical bytes, no line), so a base
      // file that now resolves onto a DIFFERENT base-tracked file exists only
      // as a link's view — the shipped set no longer carries its name. A live
      // junction-tracked file resolves to a canonical that was never a base
      // path, which is what tells the two apart.
      for (const name of baseBlobs) {
        if (diffNames.has(name) || shipped.has(name.toLowerCase()) || !plan.snapshotBlobs.has(name)) continue;
        const canonical = canonicalDiffPath(name);
        if (canonical === null || canonical.toLowerCase() === name.toLowerCase()) continue;
        const key = canonical.toLowerCase();
        if (!baseBlobsLower.has(key)) continue; // a stable junction — its canonical was never a base path
        if (rules.some(rule => rule.match(name.toLowerCase()))) { unlisted = true; continue; }
        named.add(`${name} (deleted)`);
      }
      if (named.size > 0) {
        lines.push('', `files already changed in the working state (against commit ${plan.snapshot.baseCommit.slice(0, 12)}):`);
        for (const name of [...named].sort()) lines.push(`  ${name}`);
      }
      if (unlisted) {
        lines.push('', named.size === 0
          ? 'the working state differs from the last commit only in files that do not ship — their names are not listed by design.'
          : 'other changed paths do not ship and are not named.');
      }
    }
    if (lines.length === 1) lines.push('', 'nothing else to report — the working state matches the last commit.');
  } catch {
    lines.push('', 'the tool could not gather more — inspect the repository for what was tried.');
  }
  return { file: 'tool-written', text: `${lines.join('\n')}\n` };
}

export function finalizeBounty(plan: BountyPlan): BountyResult {
  const outDir = plan.outDir;
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    throw new BountyRefused('out-dir-not-empty', `out directory ${outDir} is not empty — point --out at a new or empty folder`);
  }
  mkdirSync(dirname(outDir), { recursive: true });
  const staging = mkdtempSync(join(dirname(outDir), '.box-bounty-staging-'));
  try {
    const snapshotDir = join(staging, 'repo');
    mkdirSync(snapshotDir, { recursive: true }); // the folder exists even when nothing ships
    const files: BountyManifest['files'][number][] = [];
    let packageJson: Buffer | null = null;
    for (const file of plan.files) {
      // Bytes come from the recorded tree, not the live worktree: what ships is
      // exactly what the identifier pins, and a file edited or a directory swapped
      // for a junction between plan and write cannot smuggle in other bytes. The
      // worktree is read only when the canonical path was never itself a tree
      // entry (a tracked link pointing at an untracked target).
      let bytes: Buffer;
      if (plan.snapshotBlobs.has(file.path)) {
        const blob = gitBlob(plan.repoRoot, plan.snapshot.commit, file.path);
        if (blob === null) {
          throw new BountyRefused('unreadable-path', `snapshot blob for ${file.path} cannot be read back — the object store changed mid-run; rerun box bounty create`);
        }
        bytes = blob;
      } else {
        try {
          bytes = readFileSync(file.realPath);
        } catch {
          throw new BountyRefused('unreadable-path', `${file.path} vanished between planning and writing — rerun box bounty create`);
        }
      }
      const target = join(snapshotDir, ...file.path.split('/'));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      files.push({ path: file.path, sha256: sha256(bytes), bytes: bytes.length });
      if (file.path === 'package.json') packageJson = bytes;
    }
    // The licence fact: a licence file at the shipped root gets named, and a
    // shipped package.json's `license` field is stated as declared.
    let declared: string | null = null;
    if (packageJson !== null) {
      try {
        const pkg = JSON.parse(packageJson.toString('utf8')) as { license?: unknown };
        if (typeof pkg.license === 'string' && pkg.license.trim() !== '') declared = pkg.license.trim();
      } catch { /* an unreadable package.json leaves declared null — a fact, not an error */ }
    }
    const licence = {
      file: files.find(entry => !entry.path.includes('/') && LICENCE_NAME.test(entry.path))?.path ?? null,
      declared
    };
    // The note: the agent's file when --note was given, else the tool composes
    // it here from the files the working state already changed.
    const note = plan.note ?? composeNote(plan);
    const createdAt = new Date().toISOString();
    const id = `bt-${sha256(`${plan.snapshot.commit}\n${plan.title}\n${createdAt}`).slice(0, 12)}`;
    const manifest: BountyManifest = {
      schemaVersion: 1,
      kind: 'box-bounty',
      id,
      title: plan.title,
      createdAt,
      tool: TOOL_VERSION,
      task: plan.task,
      note,
      licence,
      snapshot: plan.snapshot,
      files,
      counts: { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), removed: plan.removed.length },
      neverShip: plan.ruleRemovals.map(entry => ({ rule: entry.rule, removed: entry.removed }))
    };
    const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
    writeFileSync(join(staging, 'bounty.json'), manifestJson);
    // The draft listing states the reward in force at create — this
    // repository's own (BT11c); a folder post rewrites it with the amount in
    // force at posting, which is the amount the record binds (BT11a).
    writeFileSync(join(staging, 'README.md'), renderListing(manifest, note, repoReward(plan.repoRoot).amount));
    if (existsSync(outDir)) rmdirSync(outDir); // only reachable when outDir is empty (checked above)
    renameSync(staging, outDir);
    // With the folder in place, make it reachable later: pin the snapshot
    // commit under refs/box-bounty/<id> (gc cannot prune it now) and write the
    // record at stage `drafted` into .box/bounties/ inside the repository.
    const written = writeNewRecord(plan.repoRoot, {
      id,
      title: plan.title,
      why: plan.why,
      snapshot: plan.snapshot,
      folder: outDir,
      createdAt,
      job: plan.job,
      resume: plan.resume,
      noteSource: plan.note === null ? 'generated' : 'authored',
      // sha256 of the exact bounty.json bytes: the answer's manifest must come
      // back byte-identical, which binds a returned folder to this bounty.
      manifestSha256: sha256(manifestJson),
      // A scan hit at create holds nothing, but it is recorded the same way
      // — the record says what was flagged and what happened.
      scanFindings: plan.scan.hits.length === 0 ? [] : [{ at: createdAt, where: 'create', hits: [...plan.scan.hits], settled: null }]
    });
    return { id, outDir, plan, recordPath: written.path };
  } catch (error) {
    rmSync(staging, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    throw error;
  }
}
