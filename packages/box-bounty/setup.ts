// `omakase-box setup` (PF16): the one thing a person runs. It puts `omakase-box` on the machine and a small
// skill where agents look, so a new session finds the tool with nobody telling it. It writes
// only its own folder, says what it wrote, and `--remove` takes that away. A folder of that
// name without our marker is someone else's, and is left alone.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { nearestOf } from './args.js';
import { refusalDocument } from './json.js';
import { SKILL_TARGETS } from './instructions.js';
import { INSTALL_SPEC, PACKAGE_REMOVE, SKILL_MARKER, SKILL_MARKER_OLD, SKILL_TEXT } from './wording.js';

const SKILL = 'omakase-box';

// Fixed text from this file, the way the hosts' own docs write it: nothing from outside, and no username to paste into a chat.
const shown = (target: typeof SKILL_TARGETS[number]): string => `~/${target.skills.join('/')}/${SKILL}`;

const found = (home: string, target: typeof SKILL_TARGETS[number]): boolean => target.homes.some(name => existsSync(join(home, name)));

// An `omakase-box` from npx's own cache is gone with the cache, so it does not count as installed.
function boxOnPath(): boolean {
  const names = process.platform === 'win32' ? ['omakase-box.cmd', 'omakase-box.exe', 'omakase-box'] : ['omakase-box'];
  return (process.env['PATH'] ?? '').split(delimiter).some(dir => dir !== '' && !/[\\/]_npx[\\/]/.test(dir) && names.some(name => existsSync(join(dir, name))));
}

function installBox(): string {
  if (boxOnPath()) return 'omakase-box: already on this machine.';
  const spec = process.env['BOX_SETUP_PACKAGE'] ?? INSTALL_SPEC;
  const args = ['install', '-g', spec, '--no-audit', '--no-fund'];
  // `npm` is a .cmd on Windows: spawn it through cmd there, not bare.
  const run = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm', ...args], { encoding: 'utf8', windowsHide: true })
    : spawnSync('npm', args, { encoding: 'utf8' });
  if (run.status === 0) return 'omakase-box: installed on this machine.';
  const why = (run.stderr ?? '').split('\n').find(line => line.trim() !== '')?.trim().slice(0, 200) ?? 'npm did not say why';
  return `omakase-box: not installed (${why}); next: npm install -g ${spec}`;
}

// What is at our folder: nothing, ours, or someone else's.
function holder(folder: string): 'none' | 'ours' | 'foreign' {
  const stat = lstatSync(folder, { throwIfNoEntry: false });
  if (stat === undefined) return 'none';
  if (!stat.isDirectory()) return 'foreign';
  try {
    const file = join(folder, 'SKILL.md');
    return !lstatSync(file).isSymbolicLink() && [SKILL_MARKER, SKILL_MARKER_OLD].some(marker => readFileSync(file, 'utf8').includes(marker)) ? 'ours' : 'foreign';
  } catch { return 'foreign'; }
}

export function runSetup(): string[] {
  const home = homedir();
  const lines = [installBox()];
  const targets = SKILL_TARGETS.filter(target => found(home, target));
  for (const target of targets) {
    const folder = join(home, ...target.skills, SKILL);
    if (holder(folder) === 'foreign') { lines.push(`${target.names}: ${shown(target)} is not ours, so it was left as it is; nothing written.`); continue; }
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'SKILL.md'), SKILL_TEXT);
    lines.push(`${target.names}: wrote ${shown(target)}/SKILL.md, nothing else.`);
  }
  if (targets.length === 0) lines.push('no agent found in its usual place, so no skill was written; next: inside a project, omakase-box config set instructions true adds a block to its instruction files.');
  else lines.push('your next agent session finds the tool. It asks you what it cannot decide.');
  lines.push('undo: omakase-box setup --remove');
  return lines;
}

// BT65: what `setup --help` prints. Fixed text from this file, so the owner reads what the command will do before running it.
// Re-running refreshes our skill (as the tools this one is modelled on do), so the text says that edits to it are replaced.
export const SETUP_USAGE: readonly string[] = [
  'usage: omakase-box setup [--remove]',
  `  puts omakase-box on this machine (npm install -g, only when it is not already there) and writes one small skill, SKILL.md, in its own folder named ${SKILL}, where your agents look: ${SKILL_TARGETS.map(target => `${shown(target)} (${target.names})`).join(' and ')}, for the agents found.`,
  '  a skill folder of that name that is not ours is left as it is. Running setup again refreshes our skill: edits to it are replaced, so keep your own skills in their own folders.',
  `  --remove takes our skill away, only where it carries our marker; the command itself stays: ${PACKAGE_REMOVE}.`,
  '  --help prints this and writes nothing.',
  '  example: omakase-box setup'
];

/** BT65: `setup` acts on exactly nothing after it (the setup) or exactly `--remove`; `--help` and `-h` print the usage and
    write nothing; anything else is refused, naming the nearest real option, and writes nothing. Exit 2 is a usage error. */
export function runSetupCommand(args: readonly string[]): { readonly lines: string[]; readonly code: 0 | 2; readonly document?: object } {
  // BT61: --json asks for one document (box-bounty/setup@1, or box-bounty/refusal@1 for a usage error) instead of lines.
  const json = args.includes('--json');
  const rest = args.filter(arg => arg !== '--json');
  const answer = (action: 'setup' | 'remove' | 'help', lines: string[]): { readonly lines: string[]; readonly code: 0 | 2; readonly document?: object } =>
    json ? { lines, code: 0, document: { schema: 'box-bounty/setup@1', action, lines, notices: [] } } : { lines, code: 0 };
  if (rest.length === 0) return answer('setup', runSetup());
  if (rest.length === 1 && rest[0] === '--remove') return answer('remove', runSetupRemove());
  if (rest.length === 1 && (rest[0] === '--help' || rest[0] === '-h')) return answer('help', [...SETUP_USAGE]);
  const first = rest[0]!;
  const nearest = first.startsWith('-') ? nearestOf(first, ['--remove', '--help']) : undefined;
  const what = rest.length > 1 && (first === '--remove' || first === '--help' || first === '-h')
    ? `setup takes ${first} alone, not with "${rest.slice(1).join(' ').slice(0, 40)}"`
    : first.startsWith('-') ? `unknown option ${first.slice(0, 40)} for setup${nearest === undefined ? '' : ` — did you mean ${nearest}?`}`
    : `unexpected word "${first.slice(0, 40)}" for setup; it takes --remove or --help`;
  if (json) return { lines: [], code: 2, document: refusalDocument('setup', 'usage', `${what}; nothing was written; next: omakase-box setup --help`, 2, SETUP_USAGE) };
  return { lines: [`setup refused (setup-usage): ${what}; nothing was written; next: omakase-box setup --help`], code: 2 };
}

export function runSetupRemove(): string[] {
  const home = homedir();
  const lines = SKILL_TARGETS.flatMap(target => {
    const folder = join(home, ...target.skills, SKILL);
    const state = holder(folder);
    if (state === 'none') return [];
    if (state === 'foreign') return [`${target.names}: ${shown(target)} is not ours, so it was left as it is.`];
    unlinkSync(join(folder, 'SKILL.md'));
    rmdirSync(folder);
    return [`${target.names}: removed ${shown(target)}.`];
  });
  return [...(lines.length === 0 ? ['no skill of ours was found; nothing changed.'] : lines), `omakase-box itself stays; next: ${PACKAGE_REMOVE} takes it off this machine.`];
}
