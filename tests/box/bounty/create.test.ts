import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BountyRefused, finalizeBounty, loadRecord, planBounty, renderPreview } from '../../../packages/box-bounty/index.js';
import type { BountyResult, CreateOptions } from '../../../packages/box-bounty/index.js';
import { git, listTree, makeRepo, runRoot, write } from './support.js';

// The create flow end to end: preview first, the folder written or a named
// refusal. Checks were removed on 11 October 2026 — create neither accepts nor
// runs a command, and the listing carries no check section and no level.

function repoWithTask(files: Record<string, string>): string {
  const repo = makeRepo(files);
  write(repo, 'TASK.md', 'Make the check pass.\n');
  return repo;
}

function options(repo: string, extra: Partial<CreateOptions> = {}): CreateOptions {
  return {
    repoPath: repo,
    why: 'stuck after two approaches',
    title: 'make the check pass',
    taskPath: join(repo, 'TASK.md'),
    ...extra
  };
}

const readDraft = (result: BountyResult) => ({ ...result.plan, ...loadRecord(result.plan.repoRoot, result.id).content });

describe('bounty create end to end', () => {

  it('refuses a negation line in .boxignore instead of silently ignoring it', () => {
    const repo = repoWithTask({ 'src/x.py': 'x\n', '.boxignore': '!keep-this.txt\n' });
    try {
      planBounty(options(repo));
      expect.unreachable('expected refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(BountyRefused);
      expect((error as BountyRefused).reason).toBe('invalid-boxignore');
    }
  });
});

describe('BT3b — fewer things to supply', () => {
  it('refuses create without --why by name — missing-why, never a usage wall', () => {
    const repo = repoWithTask({ 'src/x.py': 'x\n' });
    for (const why of [undefined, '   '] as (string | undefined)[]) {
      try {
        planBounty({ repoPath: repo, why: why ?? '', taskPath: join(repo, 'TASK.md'), });
        expect.unreachable('expected refusal');
      } catch (error) {
        expect(error).toBeInstanceOf(BountyRefused);
        expect((error as BountyRefused).reason).toBe('missing-why');
      }
    }
  });

  it('derives the title from the task\'s first non-empty line; --title still wins', () => {
    const repo = repoWithTask({ 'src/x.py': 'x\n' });
    write(repo, 'TASK.md', '\n\n  Make the check pass.\nwith more detail below\n');
    const derived = planBounty({ repoPath: repo, why: 'w', taskPath: join(repo, 'TASK.md'), });
    expect(derived.title).toBe('Make the check pass.');
    const blank = planBounty({ repoPath: repo, why: 'w', title: '   ', taskPath: join(repo, 'TASK.md'), });
    expect(blank.title).toBe('Make the check pass.');
    const given = planBounty({ repoPath: repo, why: 'w', title: 'given title', taskPath: join(repo, 'TASK.md'), });
    expect(given.title).toBe('given title');
  });

  it('composes the note from evidence when no --note is given: the files changed so far', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', '.env': 'FAKE=made-up\n', 'TASK.md': 'the task\n' });
    // Uncommitted work is the evidence: a touched source file, a new task file,
    // and a never-ship file that must never be named inside the bounty.
    write(repo, 'src/app.py', 'y\n');
    write(repo, '.env', 'FAKE=changed\n');
    write(repo, 'NEW.md', 'uncommitted\n');
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
    }));
    const manifest = readDraft(result);
    expect(manifest.note?.file).toBe('tool-written');
    const text = manifest.note?.text ?? '';
    expect(text).toContain('written by the tool');
    expect(text).toContain('src/app.py');
    expect(text).toContain('NEW.md');
    expect(text).not.toContain('.env'); // removed names never ship, even in the note
    const listing = loadRecord(repo, result.id).content?.note?.text ?? '';
    expect(listing).toContain('written by the tool');
  });

  it('never claims the working state matches the last commit when only never-ship paths differ', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', 'id_rsa': 'fake-key\n', 'TASK.md': 'the task\n' });
    write(repo, 'id_rsa', 'fake-key-changed\n'); // the only diff is a path that never ships
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
    }));
    const text = readDraft(result).note?.text ?? '';
    expect(text).not.toContain('matches the last commit');
    expect(text).not.toContain('id_rsa'); // the name still never ships
  });

  it('names a file the working state deleted instead of claiming the tree matches the last commit', () => {
    const repo = makeRepo({ 'a.py': 'a\n', 'b.py': 'b\n', '.env': 'FAKE=made-up\n', 'TASK.md': 'the task\n' });
    rmSync(join(repo, 'b.py'));
    rmSync(join(repo, '.env')); // a deleted never-ship path: real, but never named
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
    }));
    const text = readDraft(result).note?.text ?? '';
    expect(text).not.toContain('matches the last commit');
    expect(text).toContain('b.py (deleted)');
    expect(text).not.toContain('.env');
  });

  it('names the shipped file a rename folded out of the diff instead of claiming only non-shipping paths differ', () => {
    const repo = makeRepo({ 'a.py': 'a\n', 'TASK.md': 'the task\n' }, (repo) => {
      // `git mv a.py .env` is a delete+add pair git pairs by similarity:
      // --name-only emits only `.env`, folding the shipped file away entirely.
      git(repo, ['mv', 'a.py', '.env']);
    });
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
    }));
    const text = readDraft(result).note?.text ?? '';
    expect(text).not.toContain('only in files that do not ship'); // a.py shipped in the base — its loss is real change
    expect(text).toContain('a.py (deleted)'); // the folded-away rename source is still reported
    expect(text).not.toContain('.env'); // the rename target is a never-ship name — never inside the bounty
  });

  // Host-only (K10): junctions are invisible to git on Windows, so git tracks
  // jdir/f.py under that spelling while shipping emits the canonical
  // realdir/f.py — the note must classify the canonical path, not the spelling.
  it.skipIf(process.platform !== 'win32')('classifies a junction-spelled tracked file by the canonical path it ships under', () => {
    const repo = makeRepo({ '.gitignore': 'realdir/\n', 'TASK.md': 'the task\n' }, (repo) => {
      write(repo, 'realdir/f.py', 'x\n');
      symlinkSync(join(repo, 'realdir'), join(repo, 'jdir'), 'junction');
      git(repo, ['add', 'jdir/f.py']); // git records the junction spelling
      git(repo, ['-c', 'user.name=bt1-test', '-c', 'user.email=bt1@test.invalid', 'commit', '-qm', 'track the junction spelling']);
    });
    write(repo, 'realdir/f.py', 'x2\n'); // the changed bytes ship under the canonical name
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
    }));
    const manifest = readDraft(result);
    expect(manifest.files.map(file => file.path)).toContain('realdir/f.py'); // it ships, canonically
    const text = manifest.note?.text ?? '';
    expect(text).toContain('realdir/f.py'); // named under the path it ships as
    expect(text).not.toContain('jdir'); // the spelling is not what shipped — never named
    expect(text).not.toContain('only in files that do not ship');
  });

  // Host-only (K10): junctions are invisible to git on Windows. Deleting a
  // tracked file and planting a junction on its spelling must not redirect the
  // deletion's judgement through the link — the note names the base spelling
  // the owner deleted, never the live directory that now occupies it.
  it.skipIf(process.platform !== 'win32')('names a tracked file deleted under a junction replacement — not the live directory the link resolves to', () => {
    const repo = makeRepo({ '.gitignore': 'realdir/\n', 'a.py': 'a\n', 'TASK.md': 'the task\n' }, (repo) => {
      rmSync(join(repo, 'a.py'));
      write(repo, 'realdir/f.py', 'f\n');
      symlinkSync(join(repo, 'realdir'), join(repo, 'a.py'), 'junction');
    });
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
    }));
    const text = readDraft(result).note?.text ?? '';
    expect(text).toContain('a.py (deleted)'); // the spelling the owner deleted
    expect(text).not.toContain('realdir (deleted)'); // a live directory that was never deleted
    expect(text).not.toContain('only in files that do not ship');
  });

  // Host-only (K10): the same replacement pointed at a never-ship target must
  // still name the lost base file — a deletion resolved through the link reads
  // as a non-shipping path and prints the exact false all-clear.
  it.skipIf(process.platform !== 'win32')('a tracked file deleted under a junction to a never-ship dir is still named — never a false all-clear', () => {
    const repo = makeRepo({ '.gitignore': 'secrets/\n', 'a.py': 'a\n', 'TASK.md': 'the task\n' }, (repo) => {
      rmSync(join(repo, 'a.py'));
      write(repo, 'secrets/f.py', 's\n');
      symlinkSync(join(repo, 'secrets'), join(repo, 'a.py'), 'junction');
    });
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
    }));
    const text = readDraft(result).note?.text ?? '';
    expect(text).toContain('a.py (deleted)'); // a base-shipped file is gone — that fact must be said
    expect(text).not.toContain('only in files that do not ship'); // the false all-clear
    expect(text).not.toContain('secrets'); // the name behind the link still never ships
  });

  // Host-only (K10): a tracked dir swapped for a junction repopulates its
  // paths through the link — add -A records identical bytes so the diff stays
  // silent. The base path still ships under another name's spelling no more:
  // it is absent and the note must say so — while the junction's new spelling
  // of an unchanged file is not a change.
  it.skipIf(process.platform !== 'win32')('a tracked dir replaced by a junction still names the file it lost — repopulation through the link hides no deletion', () => {
    const repo = makeRepo({ 'dir/f.py': 'f\n', 'other/f.py': 'f\n', 'other/g.py': 'g\n', 'TASK.md': 'the task\n' }, (repo) => {
      rmSync(join(repo, 'dir'), { recursive: true });
      symlinkSync(join(repo, 'other'), join(repo, 'dir'), 'junction');
    });
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
    }));
    const text = readDraft(result).note?.text ?? '';
    expect(text).toContain('dir/f.py (deleted)'); // repopulated through the link — no diff line, still gone
    expect(text).not.toContain('other/g.py'); // unchanged — the junction's new spelling is not a change
  });

  // Host-only (K10): the same swap with DIFFERENT bytes behind the link — git
  // records ` M a/b.py` and the spelling survives in the snapshot tree as a
  // modified blob, so no deletion branch fires. The base spelling's judgement
  // must still outrank live canonicalisation: `a/b.py` no longer exists as
  // itself in the shipped set.
  it.skipIf(process.platform !== 'win32')('a tracked dir swapped for a junction holding different bytes still names the file the shipped set lost', () => {
    const repo = makeRepo({ 'a/b.py': 'b1\n', 'x/b.py': 'b2\n', 'TASK.md': 'the task\n' }, (repo) => {
      rmSync(join(repo, 'a'), { recursive: true });
      symlinkSync(join(repo, 'x'), join(repo, 'a'), 'junction');
    });
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
    }));
    const manifest = readDraft(result);
    expect(manifest.files.map(file => file.path)).not.toContain('a/b.py'); // the spelling ships no more
    const text = manifest.note?.text ?? '';
    expect(text).toContain('a/b.py (deleted)'); // a base file the bounty no longer carries
    expect(text).not.toContain('matches the last commit'); // the false all-clear
    expect(text).not.toContain('x/b.py'); // the unchanged redirect target is not a change
  });

  // Host-only (K10): the same swap pointed at a tracked never-ship target. A
  // rule-covered canonical must never suppress a rule-free base spelling's
  // change — `a/b.py`'s loss is named while the name behind the link still
  // never ships.
  it.skipIf(process.platform !== 'win32')('a junction swap onto a tracked never-ship target still names the lost base file — never a false all-clear', () => {
    const repo = makeRepo({ 'a/b.py': 'b1\n', 'secrets/b.py': 'b2\n', 'TASK.md': 'the task\n' }, (repo) => {
      rmSync(join(repo, 'a'), { recursive: true });
      symlinkSync(join(repo, 'secrets'), join(repo, 'a'), 'junction');
    });
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
    }));
    const text = readDraft(result).note?.text ?? '';
    expect(text).toContain('a/b.py (deleted)'); // a rule-free base spelling's loss is real
    expect(text).not.toContain('only in files that do not ship'); // the false all-clear
    expect(text).not.toContain('secrets'); // the name behind the link still never ships
  });

  it('labels a moved submodule HEAD as a submodule change, never a deleted file', () => {
    const sub = makeRepo({ 's.py': 's\n' });
    const repo = makeRepo({ 'TASK.md': 'the task\n' }, (repo) => {
      git(repo, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sub.split('\\').join('/'), 'sub']);
      git(repo, ['-c', 'user.name=bt1-test', '-c', 'user.email=bt1@test.invalid', 'commit', '-qm', 'add submodule']);
    });
    // Move the submodule's HEAD: the gitlink changes but no blob does. A
    // gitlink is never a blob in the snapshot tree, so it must not read as a
    // deletion.
    write(join(repo, 'sub'), 's.py', 's2\n');
    git(join(repo, 'sub'), ['add', '-A']);
    git(join(repo, 'sub'), ['-c', 'user.name=bt1-test', '-c', 'user.email=bt1@test.invalid', 'commit', '-qm', 's2']);
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
    }));
    const text = readDraft(result).note?.text ?? '';
    expect(text).toContain('sub (submodule changed)');
    expect(text).not.toContain('sub (deleted)');
  });

  it('a repo with nothing to report gets a plain note, not an error', () => {
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'the task\n' });
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
    }));
    const text = readDraft(result).note?.text ?? '';
    expect(text).toContain('written by the tool');
    expect(text).toContain('nothing else to report');
  });
});
