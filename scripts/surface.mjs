// BT62: the tool's surface record, tests/box/bounty/SURFACE.txt.
//   node scripts/surface.mjs          rebuild the tool, run bt62 and the tests that own a document's fields; exit 0 only
//                                     when the built tool's surface equals the record (each difference is named).
//   node scripts/surface.mjs --write  the same runs, each part writing what it derived; the parts are merged, sorted, into
//                                     the record. Commit the record's diff with the change it describes.
// The derivation lives in tests/box/bounty/surface.ts (one source); this only runs it.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, runNode } from './process.mjs';

const RECORD = join(root, 'tests', 'box', 'bounty', 'SURFACE.txt');
// bt62 holds the static half; each owner in surface.ts's OWNERS checks its documents' fields.
const FILES = ['bt62', 'json-agreement', 'bt61-journey', 'bt61', 'bt61-solver', 'pf24', 'bt28', 'bt43'].map(name => `tests/box/bounty/${name}.test.ts`);

const args = process.argv.slice(2);
const write = args[0] === '--write';
if (args.length > (write ? 1 : 0)) {
  console.error('usage: node scripts/surface.mjs [--write]');
  process.exit(2);
}

if (await runNode(join(root, 'scripts', 'workspace.mjs'), ['build']) !== 0) {
  console.error('surface: the build failed; nothing was compared');
  process.exit(1);
}

if (!write) {
  const code = await runNode(join(root, 'scripts', 'suite.mjs'), ['box', '--suite', 'bounty', ...FILES]);
  console.log(code === 0 ? 'surface: the built tool matches tests/box/bounty/SURFACE.txt' : 'surface: a difference or a failure is named above');
  process.exit(code);
}

const parts = mkdtempSync(join(tmpdir(), 'box-surface-'));
try {
  const code = await runNode(join(root, 'scripts', 'suite.mjs'), ['box', '--suite', 'bounty', ...FILES], { env: { ...process.env, BT62_WRITE: parts } });
  if (code !== 0) {
    console.error('surface: a test failed while deriving the record; the record is unchanged');
    process.exit(code);
  }
  const files = readdirSync(parts).filter(name => name.endsWith('.txt'));
  // static.txt plus one fields-<owner>.txt per owner: a part that did not write means its test did not reach the check.
  if (!files.includes('static.txt') || files.length !== FILES.length) {
    console.error(`surface: expected ${FILES.length} parts, got ${files.length} (${files.join(', ')}); the record is unchanged`);
    process.exit(1);
  }
  const lines = [...new Set(files.flatMap(name => readFileSync(join(parts, name), 'utf8').split('\n').filter(line => line !== '')))].sort();
  const before = existsSync(RECORD) ? readFileSync(RECORD, 'utf8') : '';
  writeFileSync(RECORD, lines.join('\n') + '\n');
  console.log(before === lines.join('\n') + '\n' ? `surface: the record is unchanged (${lines.length} lines)` : `surface: wrote tests/box/bounty/SURFACE.txt (${lines.length} lines); review its diff`);
} finally {
  rmSync(parts, { recursive: true, force: true });
}
