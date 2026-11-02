// `box setup` (PF16): the one thing a person runs. It puts `box` on the machine and a small
// skill where agents look, so a new session finds the tool with nobody telling it. It writes
// only its own folder, says what it wrote, and `--remove` takes that away. A folder of that
// name without our marker is someone else's, and is left alone.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { showPath } from './notice.js';
import { INSTALL_SPEC, PACKAGE_REMOVE, SKILL_MARKER, SKILL_TEXT } from './wording.js';

const SKILL = 'omakase-box';

// Each host's documented user-level skills folder, read on 2 November 2026. Cursor, Gemini CLI
// and Codex all read ~/.agents/skills, so one folder serves them.
const TARGETS = [
  { names: 'Claude Code', home: '.claude', skills: ['.claude', 'skills'] },
  { names: 'Codex, Cursor and Gemini CLI', home: ['.codex', '.cursor', '.gemini', '.agents'], skills: ['.agents', 'skills'] }
] as const;

const found = (home: string, target: typeof TARGETS[number]): boolean =>
  (typeof target.home === 'string' ? [target.home] : target.home).some(name => existsSync(join(home, name)));

// A `box` from npx's own cache is gone with the cache, so it does not count as installed.
function boxOnPath(): boolean {
  const names = process.platform === 'win32' ? ['box.cmd', 'box.exe', 'box'] : ['box'];
  return (process.env['PATH'] ?? '').split(delimiter).some(dir => dir !== '' && !/[\\/]_npx[\\/]/.test(dir) && names.some(name => existsSync(join(dir, name))));
}

function installBox(): string {
  if (boxOnPath()) return 'box: already on this machine.';
  const spec = process.env['BOX_SETUP_PACKAGE'] ?? INSTALL_SPEC;
  const args = ['install', '-g', spec, '--no-audit', '--no-fund'];
  // `npm` is a .cmd on Windows: spawn it through cmd there, not bare.
  const run = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm', ...args], { encoding: 'utf8', windowsHide: true })
    : spawnSync('npm', args, { encoding: 'utf8' });
  if (run.status === 0) return 'box: installed on this machine.';
  const why = (run.stderr ?? '').split('\n').find(line => line.trim() !== '')?.trim().slice(0, 200) ?? 'npm did not say why';
  return `box: not installed (${why}); next: npm install -g ${spec}`;
}

// What is at our folder: nothing, ours, or someone else's.
function holder(folder: string): 'none' | 'ours' | 'foreign' {
  const stat = lstatSync(folder, { throwIfNoEntry: false });
  if (stat === undefined) return 'none';
  if (!stat.isDirectory()) return 'foreign';
  try {
    const file = join(folder, 'SKILL.md');
    return !lstatSync(file).isSymbolicLink() && readFileSync(file, 'utf8').includes(SKILL_MARKER) ? 'ours' : 'foreign';
  } catch { return 'foreign'; }
}

export function runSetup(): string[] {
  const home = homedir();
  const lines = [installBox()];
  const targets = TARGETS.filter(target => found(home, target));
  for (const target of targets) {
    const folder = join(home, ...target.skills, SKILL);
    if (holder(folder) === 'foreign') { lines.push(`${target.names}: ${showPath(folder)} is not ours, so it was left as it is; nothing written.`); continue; }
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'SKILL.md'), SKILL_TEXT);
    lines.push(`${target.names}: wrote ${showPath(join(folder, 'SKILL.md'))}, nothing else.`);
  }
  if (targets.length === 0) lines.push('no agent found in its usual place, so no skill was written; next: inside a project, box bounty config set instructions true adds a block to its instruction files.');
  else lines.push('your next agent session finds the tool. It asks you what it cannot decide.');
  lines.push('undo: box setup --remove');
  return lines;
}

export function runSetupRemove(): string[] {
  const home = homedir();
  const lines = TARGETS.flatMap(target => {
    const folder = join(home, ...target.skills, SKILL);
    const state = holder(folder);
    if (state === 'none') return [];
    if (state === 'foreign') return [`${target.names}: ${showPath(folder)} is not ours, so it was left as it is.`];
    unlinkSync(join(folder, 'SKILL.md'));
    rmdirSync(folder);
    return [`${target.names}: removed ${showPath(folder)}.`];
  });
  return [...(lines.length === 0 ? ['no skill of ours was found; nothing changed.'] : lines), `box itself stays; next: ${PACKAGE_REMOVE} takes it off this machine.`];
}
