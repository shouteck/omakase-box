// Host side. Reads bytes only; runs no project code.
//   node research/box-delegation/r3b/wave2/verify-copy.mjs <scratch folder> <retained box.json>
// Checks that the Box copy in <scratch>/work is byte-identical to what the product exported:
// box.json equals the retained one, every recorded file hashes to its box.json value, no
// extra files exist, and the wrapper's hard-coded checks equal the declared recipient commands.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const [scratch, retained] = process.argv.slice(2);
const work = join(scratch, 'work');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let bad = 0;
const fail = message => { bad += 1; console.log(`MISMATCH ${message}`); };

const manifestBytes = readFileSync(join(work, 'box.json'));
if (sha(manifestBytes) !== sha(readFileSync(retained))) fail('box.json differs from the retained copy');
const box = JSON.parse(manifestBytes.toString('utf8'));
let crlf = 0;
for (const file of box.files) {
  const bytes = readFileSync(join(work, file.box));
  if (sha(bytes) !== file.sha256 || bytes.length !== file.bytes) fail(`${file.box}`);
  if (bytes.includes('\r\n')) crlf += 1;
}
const present = [];
const walk = dir => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const target = join(dir, entry.name); if (entry.isDirectory()) walk(target); else present.push(relative(work, target).split('\\').join('/')); } };
walk(work);
const expected = new Set([...box.files.map(file => file.box), 'box.json', 'box/submit.mjs']);
for (const path of present) if (!expected.has(path)) fail(`unexpected file ${path}`);
for (const path of expected) if (!present.includes(path)) fail(`missing file ${path}`);

const wrapper = readFileSync(join(scratch, 'run-check.mjs'), 'utf8');
for (const command of box.commands.filter(entry => entry.context === 'recipient')) {
  if (!wrapper.includes(`'${command.name}'`)) fail(`wrapper lacks check ${command.name}`);
  for (const arg of command.args) if (!wrapper.includes(`'${arg}'`)) fail(`wrapper lacks argument ${arg} of ${command.name}`);
}
console.log(`box.json sha256 ${sha(manifestBytes)}; recorded files checked ${box.files.length}; files present ${present.length}; files containing CRLF ${crlf}; mismatches ${bad}`);
process.exit(bad === 0 ? 0 : 1);
