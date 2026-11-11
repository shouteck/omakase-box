// Kept from BT63 (11 November 2026) so the next rename reruns it: `node docs/box-v4/BT63/sweep.mjs dry <log> <files...>` first, read the log, then `apply`.
// BT63 sweep: the old command name becomes `omakase-box`, with the word "bounty" gone from the command.
//   node bt63-sweep.mjs <dry|apply> <log-file> <file...>
// Rules (a hit not matched here is left alone and listed by the final count):
//   `box bounty <x>` -> `omakase-box <x>`      `box bounty` (alone / before punctuation) -> `omakase-box`
//   `box setup` -> `omakase-box setup`           `box --version` / `box --help` -> `omakase-box --version` / `--help`
// Never touched: the title prefix `[box bounty <id>]` (a `[` before it), the label and markers `box-bounty`
// (a hyphen, not a space), `omakase-box` itself, and the lines in KEEP below (named, with the reason).
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const [mode, logFile, ...files] = process.argv.slice(2);
// Lines left on purpose. Each entry: file suffix + a substring of the line + why.
const KEEP = [
  ['packages/box-bounty/wording.ts', 'SKILL_MARKER =', 'the skill marker is rewritten by hand with the old one kept (setup recognises both)'],
  ['tests/box/bounty/bt63.test.ts', '', 'the file that names the old command to forbid it'],
  ['packages/box-bounty/answer.ts', 'box bounty ${record.id}:', 'a label carrying the bounty id, not a command'],
  ['packages/box-bounty/publish-plan.ts', 'box bounty ${record.id}: work in progress', 'the subject of a work-in-progress commit already pushed by 0.1.x'],
  ['packages/box-bounty/record.ts', '.replace(/', 'scrubs old stored text: the match side must keep the old name; the replacement side is edited by hand'],
  ['packages/box-bounty/render.ts', 'const noCommands', 'strips a command from stored lines; matches either name, edited by hand'],
];
const rules = [
  [/(?<![\[\w-])box bounty (?=\S)/g, 'omakase-box '],
  [/(?<![\[\w-])box bounty(?![\w-])/g, 'omakase-box'],
  [/(?<![\w-])box setup(?![\w-])/g, 'omakase-box setup'],
  [/(?<![\w-])box (--version|--help)/g, 'omakase-box $1'],
];
let total = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let changed = 0;
  const out = text.split(eol).map((line, index) => {
    const kept = KEEP.find(([suffix, needle]) => file.replaceAll('\\', '/').endsWith(suffix) && line.includes(needle));
    if (kept !== undefined) return line;
    let next = line;
    for (const [pattern, replacement] of rules) next = next.replace(pattern, replacement);
    if (next !== line) {
      changed += 1;
      appendFileSync(logFile, `${file}:${index + 1}\n- ${line.trim().slice(0, 240)}\n+ ${next.trim().slice(0, 240)}\n`);
    }
    return next;
  });
  if (changed > 0) {
    total += changed;
    console.log(`${String(changed).padStart(4)}  ${file}`);
    if (mode === 'apply') writeFileSync(file, out.join(eol));
  }
}
console.log(`${mode}: ${total} line(s) in ${files.length} file(s)`);
