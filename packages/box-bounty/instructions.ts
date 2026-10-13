import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { BountyRefused } from './errors.js';
import { attemptsOf, isOpenStage, listRecords } from './record.js';
import { readInstructions, writeInstructions } from './settings.js';
import { renderRulesBlock, RULES_MARKERS } from './wording.js';

// Confirmed against each host's documentation on 2026-10-13. Only this
// registry names hosts; discovery never creates their instruction files.
export const INSTRUCTION_HOSTS = [
  { host: 'Codex', files: ['AGENTS.md', 'AGENTS.override.md'], directory: null, imports: 'none' },
  { host: 'Claude Code', files: ['CLAUDE.md', 'CLAUDE.local.md', '.claude/CLAUDE.md'], directory: null, imports: 'at-escaped-spaces' },
  { host: 'Cursor', files: [], directory: '.cursor/rules', imports: 'none' },
  { host: 'Gemini CLI', files: ['GEMINI.md'], directory: null, imports: 'at' },
  { host: 'GitHub Copilot', files: ['.github/copilot-instructions.md'], directory: null, imports: 'none' }
] as const;

export interface InstructionFile { readonly path: string; readonly refusal?: string }
const folded = (path: string) => path.replaceAll('\\', '/').toLowerCase();
export function checkInstructionFile(repoRoot: string, named: string): string {
  const root = realpathSync(repoRoot);
  const path = resolve(root, named);
  const rel = relative(root, path);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new BountyRefused('instruction-file-outside-repo', `${named}: instruction-file-outside-repo; nothing changed`);
  let current = root;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (stat === undefined) throw new BountyRefused('instruction-file-missing', `${named}: instruction-file-missing; choose an existing file`);
    if (stat.isSymbolicLink()) throw new BountyRefused('instruction-file-link', `${named}: instruction-file-link; nothing changed`);
  }
  const stat = lstatSync(path);
  if (!stat.isFile()) throw new BountyRefused('instruction-file-not-file', `${named}: instruction-file-not-file; nothing changed`);
  if (stat.nlink > 1) throw new BountyRefused('instruction-file-link', `${named}: instruction-file-link; nothing changed`);
  if (!folded(realpathSync(path)).startsWith(`${folded(root)}/`)) throw new BountyRefused('instruction-file-outside-repo', `${named}: instruction-file-outside-repo; nothing changed`);
  return path;
}

export function discoverInstructions(repoRoot: string): InstructionFile[] {
  const paths = new Set<string>();
  for (const host of INSTRUCTION_HOSTS) {
    for (const path of host.files) if (lstatSync(join(repoRoot, path), { throwIfNoEntry: false }) !== undefined) paths.add(path);
    if (host.directory !== null) {
      const walk = (path: string): void => {
        const stat = lstatSync(join(repoRoot, path), { throwIfNoEntry: false });
        if (stat === undefined) return;
        if (stat.isSymbolicLink()) { paths.add(path); return; }
        if (!stat.isDirectory()) return;
        for (const entry of readdirSync(join(repoRoot, path), { withFileTypes: true })) {
          const child = `${path}/${entry.name}`;
          if (entry.isDirectory()) walk(child);
          else if (entry.isSymbolicLink() || entry.name.endsWith('.mdc')) paths.add(child);
        }
      };
      walk(host.directory);
    }
  }
  const choice = readInstructions(repoRoot);
  if (choice.file !== undefined) paths.add(choice.file);
  return [...paths].sort().map(path => {
    try { checkInstructionFile(repoRoot, path); return { path }; }
    catch (error) { return { path, refusal: error instanceof BountyRefused ? error.reason : 'instruction-file-unreadable' }; }
  });
}

export function instructionState(repoRoot: string): 'idle' | 'open' | 'new' {
  const open = listRecords(repoRoot).flatMap(entry => entry.record !== null && isOpenStage(entry.record.stage) ? [entry.record] : []);
  if (open.length === 0) return 'idle';
  if (open.some(record => attemptsOf(record).some(attempt => attempt.seenAt === undefined) || record.github?.availablePullRequests?.some(pr => !record.github?.seenPullRequests?.some(seen => seen.n === pr.n && seen.commit === pr.commit)))) return 'new';
  return 'open';
}
export const instructionBlock = (repoRoot: string) => renderRulesBlock(instructionState(repoRoot));

function span(bytes: Buffer): { readonly afterOpen: number; readonly closeAt: number; readonly openAt: number } | null {
  const open = Buffer.from(RULES_MARKERS.open), close = Buffer.from(RULES_MARKERS.close);
  const openAt = bytes.indexOf(open), closeAt = bytes.indexOf(close);
  const damaged = bytes.toString('latin1').match(/<!--\s*\/?box-bounty\b/g) ?? [];
  if (openAt === -1 && closeAt === -1 && damaged.length === 0) return null;
  if (openAt < 0 || closeAt < openAt + open.length || bytes.indexOf(open, openAt + open.length) !== -1 || bytes.indexOf(close, closeAt + close.length) !== -1 || damaged.length !== 2) throw new BountyRefused('instruction-markers-damaged', 'instruction-markers-damaged; nothing changed');
  return { openAt, afterOpen: openAt + open.length, closeAt };
}
export function checkInstructionMarkers(path: string): void { span(readFileSync(path)); }
function proseOutsideCode(text: string): string {
  let fence: string | null = null;
  const prose: string[] = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence !== null) {
      if (marker !== null && marker[1] !== undefined && marker[1][0] === fence[0] && marker[1].length >= fence.length && marker[2]?.trim() === '') fence = null;
      prose.push('');
    } else if (marker?.[1] !== undefined) {
      fence = marker[1];
      prose.push('');
    } else prose.push(/^(?: {4}|\t)/.test(line) ? '' : line);
  }
  return prose.join('\n').replace(/(?<!`)(`+)([\s\S]*?)(?<!`)\1(?!`)/g, ' ');
}
function imports(repoRoot: string, file: InstructionFile, files: readonly InstructionFile[]): string | null {
  const name = folded(relative(repoRoot, resolve(repoRoot, file.path)));
  const syntax = INSTRUCTION_HOSTS.find(host => host.files.some(path => folded(path) === name))?.imports ?? 'none';
  if (syntax === 'none') return null;
  const text = proseOutsideCode(readFileSync(checkInstructionFile(repoRoot, file.path), 'utf8'));
  const pattern = syntax === 'at-escaped-spaces' ? /(?:^|\s)@((?:\\[ \t]|[^\s"'`<>])+)/g : /(?:^|\s)@([^\s"'`<>]+)/g;
  for (const match of text.matchAll(pattern)) {
    const imported = (match[1] ?? '').replace(/\\([ \t])/g, '$1');
    const path = resolve(dirname(resolve(repoRoot, file.path)), imported);
    const target = files.find(candidate => candidate.refusal === undefined && folded(resolve(repoRoot, candidate.path)) === folded(path));
    if (target !== undefined && target.path !== file.path) return target.path;
  }
  return null;
}
function replaceFile(path: string, before: Buffer, after: Buffer): void {
  if (before.equals(after)) return;
  const staging = `${path}.box-${randomUUID()}.tmp`;
  try {
    writeFileSync(staging, after, { flag: 'wx', mode: lstatSync(path).mode });
    if (!readFileSync(path).equals(before)) throw new BountyRefused('instruction-file-changed', 'instruction-file-changed during update; nothing changed');
    renameSync(staging, path);
  } finally { rmSync(staging, { force: true }); }
}

export function syncInstructions(repoRoot: string, add = false): string[] {
  if (!readInstructions(repoRoot).enabled) return [];
  const files = discoverInstructions(repoRoot);
  // Imported leaves must succeed before an importer can lose its old block.
  const depth = new Map(files.map(file => {
    const seen = new Set<string>();
    let next: InstructionFile | undefined = file;
    let count = 0;
    try {
      while (next !== undefined && !seen.has(next.path)) {
        seen.add(next.path);
        const target = imports(repoRoot, next, files);
        next = target === null ? undefined : files.find(candidate => candidate.path === target);
        if (next !== undefined) count += 1;
      }
    } catch { /* The update below names the individual refusal. */ }
    return [file.path, count] as const;
  }));
  files.sort((a, b) => (depth.get(a.path) ?? 0) - (depth.get(b.path) ?? 0));
  const messages: string[] = [];
  const canonical = Buffer.from(instructionBlock(repoRoot));
  const interior = canonical.subarray(Buffer.byteLength(RULES_MARKERS.open), canonical.length - Buffer.byteLength(RULES_MARKERS.close));
  for (const file of files) {
    try {
      if (file.refusal !== undefined) { messages.push(`${file.path}: refused (${file.refusal}); nothing changed`); continue; }
      const path = checkInstructionFile(repoRoot, file.path);
      const before = readFileSync(path);
      const marked = span(before);
      const imported = imports(repoRoot, file, files);
      if (imported !== null) {
        const target = files.find(candidate => candidate.path === imported);
        const seen = new Set([file.path]);
        let next = target;
        let terminal = target;
        while (next !== undefined) {
          if (seen.has(next.path)) throw new BountyRefused('instruction-import-cycle', 'instruction-import-cycle; nothing changed');
          seen.add(next.path);
          const nextPath = checkInstructionFile(repoRoot, next.path);
          span(readFileSync(nextPath));
          terminal = next;
          const further = imports(repoRoot, next, files);
          next = further === null ? undefined : files.find(candidate => candidate.path === further);
        }
        if (terminal === undefined || span(readFileSync(checkInstructionFile(repoRoot, terminal.path))) === null) {
          if (add) throw new BountyRefused('instruction-import-unmaintained', 'instruction-import-unmaintained; nothing changed');
          messages.push(`${file.path}: imported file lacks the block; existing bytes kept. Add it with box bounty config set instructions true`);
          continue;
        }
        if (marked !== null) replaceFile(path, before, Buffer.concat([before.subarray(0, marked.openAt), before.subarray(marked.closeAt + Buffer.byteLength(RULES_MARKERS.close))]));
        messages.push(`${file.path}: imports ${imported}; block kept there once`);
        continue;
      }
      if (marked === null && !add) continue;
      const after = marked === null
        ? Buffer.concat([before, canonical])
        : Buffer.concat([before.subarray(0, marked.afterOpen), interior, before.subarray(marked.closeAt)]);
      replaceFile(path, before, after);
      messages.push(`${file.path}: block ${before.equals(after) ? 'current' : 'updated'}`);
    } catch (error) { messages.push(`${file.path}: refused (${error instanceof BountyRefused ? error.reason : 'instruction-file-unreadable'}); nothing changed`); }
  }
  return messages;
}

export function instructionNotices(repoRoot: string, includeMissing = true): string[] {
  const choice = readInstructions(repoRoot);
  const notices = [...choice.notices];
  const lines: string[] = [];
  let retired = choice.retired;
  if (existsSync(join(repoRoot, '.box', 'limits.json')) && retired !== true) {
    lines.push('.box/limits.json is no longer read and can be deleted. If you used rulesFile, re-set maintenance with box bounty config set instructions true and any custom file with box bounty config set instruction-file <existing-path>. allowedDestinations and reminders are dropped; cost and expectedAnswer now come from facts.');
    retired = true;
  }
  const files = discoverInstructions(repoRoot);
  for (const file of files) {
    if (file.refusal !== undefined) { lines.push(`${file.path}: refused (${file.refusal}); nothing changed`); continue; }
    try {
      if (!includeMissing) continue;
      if (span(readFileSync(checkInstructionFile(repoRoot, file.path))) !== null || imports(repoRoot, file, files) !== null) continue;
      const key = createHash('sha256').update(file.path).digest('hex');
      if (notices.includes(key)) continue;
      lines.push(`${file.path} lacks the block; add it with box bounty config set instructions true`);
      notices.push(key);
    } catch (error) { lines.push(`${file.path}: refused (${error instanceof BountyRefused ? error.reason : 'instruction-file-unreadable'}); nothing changed`); }
  }
  if (retired !== choice.retired || notices.length !== choice.notices.length) writeInstructions(repoRoot, { ...choice, notices, ...(retired === undefined ? {} : { retired }) });
  return lines;
}
