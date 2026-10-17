import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { BountyRefused } from './errors.js';
import { gitOutcome, ownerGitOutcome } from './git.js';
import { BUILTIN_RULES, publishListed, publishLists, shipRules } from './never-ship.js';
import type { NeverShipRule } from './never-ship.js';
import { looksBinary, scanText } from './scan.js';
import type { ScanHit } from './scan.js';
import { canonicalForNew, writeNewRecord } from './record.js';
import { readDecision, repoReward, requireRepository } from './settings.js';
import { createSnapshot } from './snapshot.js';
import type { SnapshotFile, SnapshotRemoval } from './snapshot.js';

export const TOOL_VERSION = 'box-bounty@0.1.0';
const PREVIEW_NAMES_PER_RULE = 20;

export interface CreateOptions {
  readonly resumeNote?: string;
  readonly repoPath: string;
  /** `--why "<one line>"`: why this is being handed off — required. It lives
      only in the record, so the reasons for handing off can be learned. */
  readonly why: string;
  /** `--title`: absent or blank, the title is the task's first non-empty line. */
  readonly title?: string;
  /** `--part-of "<job or bounty-id>"`: the larger job or parent bounty this
      bounty belongs to — one recorded line, shown on status and matched by
      `find` (BT28). */
  readonly partOf?: string;
  readonly taskPath: string;
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
  /** The job or bounty this bounty belongs to — record only (BT28). */
  readonly partOf?: string;
  readonly task: { readonly file: string; readonly text: string };
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
  /** The create-time scan (BT8c): the selected working files are read
      for the same secret shapes the publication scan watches.
      A hit at create holds nothing; it is recorded on the record the same
      way. `suppressed` counts hits on owner safe-listed paths; `binary`
      names files Git would treat as binary — they were not scanned. */
  readonly scan: { readonly hits: readonly ScanHit[]; readonly suppressed: number; readonly binary: readonly string[]; readonly filesScanned: number };
}

export interface BountyResult {
  readonly id: string;
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
    throw new BountyRefused('never-ship-input', `${path} resolves to ${inside ? offset : real}, which the never-ship rule '${matched.name}' removes — the task file must be safe to embed. They may sit anywhere outside the never-ship paths — inside the repository or outside it, committed or not`);
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

export function planBounty(options: CreateOptions): BountyPlan {
  const why = options.why.trim();
  if (why === '') {
    throw new BountyRefused('missing-why', 'create needs one line of why — pass --why "<why this is handed off>". It is kept only in the record, never shipped, so the reasons for handing off can be learned from use');
  }
  const partOf = options.partOf?.trim();
  if (options.partOf !== undefined && partOf === '') {
    throw new BountyRefused('missing-part-of', 'a blank --part-of names no job or bounty — pass --part-of "<job or bounty-id>" or leave it out');
  }
  const repoRoot = resolveRepoRoot(options.repoPath, 'create');
  const rules = [...shipRules(repoRoot)];
  const task = options.taskPath === '-'
    ? { file: 'standard input', text: readFileSync(0, 'utf8') }
    : readTextFile(options.taskPath, 'missing-task', repoRoot, rules);
  if (task.text.trim() === '') throw new BountyRefused('missing-task', 'standard input is empty; a bounty needs real task content');
  // The title comes from the task when none is given: its first non-empty
  // line's first sentence, as deriveTitle states it. --title still wins
  // when supplied — and is shortened by the same stated rule.
  const derived = deriveTitle((options.title ?? '').trim()
    || task.text.split('\n').map(line => line.trim()).find(line => line !== '')!);
  const title = derived.title;
  const workDir = mkdtempSync(join(tmpdir(), 'box-bt1-snap-'));
  let snapshot: ReturnType<typeof createSnapshot>;
  try {
    snapshot = createSnapshot(repoRoot, workDir, rules);
  } finally {
    rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }

  const files: PlanFile[] = [...snapshot.files];
  const removed = snapshot.removed;
  // The create-time scan (BT8c) reads the selected working files
  // for the same secret shapes the publication scan watches. A hit
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
      ])].filter(path => !path.startsWith('.box/bounties/') && !path.startsWith('.box/local/')).sort(),
      note: options.resumeNote?.trim() || null
    },
    title,
    titleShortened: derived.shortened,
    why,
    ...(partOf !== undefined ? { partOf } : {}),
    task,
    snapshot: { commit: snapshot.commit, tree: snapshot.tree, baseCommit: snapshot.baseCommit },
    snapshotBlobs: snapshot.blobs,
    snapshotLinks: snapshot.links,
    files,
    removed,
    ruleRemovals,
    scan
  };
}

export function renderPreview(plan: BountyPlan): string {
  const lines: string[] = [];
  lines.push('box bounty create — local draft');
  lines.push(`  repository: ${plan.repoRoot}`);

  if (plan.scan.hits.length === 0) {
    lines.push(`  pre-publish scan of the shipped set: clean — ${plan.scan.filesScanned} file(s) read`);
  } else {
    lines.push(`  pre-publish scan of the working state: ${plan.scan.hits.length} secret-shaped hit(s) — posting re-checks what becomes public for the first time:`);
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
    }
  }
  lines.push(`  title: ${plan.title}${plan.titleShortened ? ` (shortened — a leading # and anything past the first sentence or ${TITLE_LIMIT} characters are dropped)` : ''}`);
  lines.push(`  why: ${plan.why} (record only — never shipped)`);
  lines.push(`  reward: $${repoReward(plan.repoRoot).amount} in force now for this repository — a posted bounty states the amount in force at posting`);
  // The post's owner gate, stated at create (BT14): an agent that learns it
  // here is not surprised when post waits.
  let permission = 'not known yet — posting needs an already-public GitHub repository';
  try {
    const address = requireRepository(plan.repoRoot);
    const decision = readDecision(plan.repoRoot).decision;
    permission = decision === 'allowed'
      ? 'allowed — a GitHub post goes out'
      : decision === 'ask'
        ? 'ask me each time — a GitHub post waits for the owner\'s answer'
        : `none — a GitHub post waits for the owner's permission; box bounty allow ${address} is their answer`;
  } catch { /* an unlistable repository leaves permission unknown */ }
  lines.push(`  posting permission: ${permission}`);
  lines.push(`  task: ${plan.task.file}`);
  lines.push('  note: written by the tool from the changed files — kept locally');
  lines.push(plan.task.file === 'standard input' ? '  standard input creates no task file' : '  the task file stays where it is — the tool reads it and never commits or removes it');
  return lines.join('\n');
}

// gathers: the files the working state already changed relative to the
// snapshot's base commit. The note SHIPS — a changed path is named only when it
// is part of the shipped set or, for a file the working state deleted, when no
// never-ship rule would have kept it out — so a removed never-ship name can
// never be named inside the bounty. Both judgements run on the canonical path,
// the same one shipping was decided on — never the diff's tree spelling.
// Gathering never crashes create: a repository with nothing to report gets a
// plain note, and a failed read falls back to one too.
function composeNote(plan: BountyPlan): { file: string; text: string } {
  const lines: string[] = ['written by the tool from the changed files.'];
  try {
    if (plan.snapshot.baseCommit === null) {
      lines.push('', 'the repository has no commits yet — every shipped file is new work.');
    } else {
      // Classification speaks canonical paths for what LIVES and base-tree
      // spellings for what is GONE. Shipping and the never-ship rules were
      // decided on realpath-resolved names, so a file tracked through a
      // junction (jdir/f.py) ships as realdir/f.py and is classified by what
      // it resolves to; canonicalForNew plays the same trick it does for
      // a new path, realpathing the nearest EXISTING ancestor. But a deleted
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
  const note = composeNote(plan);
  const createdAt = new Date().toISOString();
  const id = `bt-${sha256(`${plan.snapshot.commit}\n${plan.title}\n${createdAt}`).slice(0, 12)}`;
  const written = writeNewRecord(plan.repoRoot, {
    id, title: plan.title, why: plan.why, createdAt,
    ...(plan.partOf !== undefined ? { partOf: plan.partOf } : {}),
    resume: plan.resume,
    content: { task: plan.task, note, tool: TOOL_VERSION },
    noteSource: 'generated',
    scanFindings: plan.scan.hits.length === 0 ? [] : [{ at: createdAt, where: 'create', hits: [...plan.scan.hits], settled: null }]
  });
  return { id, plan, recordPath: written.path };
}

// BT20: a draft is local — it never contacts GitHub. What posting would
// publish is `post --preview`'s answer, computed at the moment that matters.
export function createBounty(options: CreateOptions): BountyResult {
  return finalizeBounty(planBounty(options));
}
