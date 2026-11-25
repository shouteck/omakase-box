// BT62/BT99: the tool's surface record, tests/box/bounty/SURFACE.txt.
//   node scripts/surface.mjs          rebuild the tool, derive its surface and print each difference as compatible,
//                                     breaking, or accepted by a schema move to @2; exit 0 only with no difference.
//   node scripts/surface.mjs --write  the same derivation; compatible differences update the record, breaking ones
//                                     refuse unless the same change moves that document's schema to @2.
// The derivation lives in tests/box/bounty/surface.ts (one source); this runs it and owns the compatibility verdict.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, runNode } from './process.mjs';

const RECORD = join(root, 'tests', 'box', 'bounty', 'SURFACE.txt');
// bt62 holds the static half; each owner in surface.ts's OWNERS checks its documents' fields. bt62-record checks
// the record's own shape separately: during a migration the old record is exactly what is being replaced.
const FILES = ['bt62', 'json-agreement', 'bt61-journey', 'bt61', 'bt61-solver', 'pf24', 'bt28', 'bt43', 'pf6-wait', 'take-preview'].map(name => `tests/box/bounty/${name}.test.ts`);
const RECORD_SHAPE = 'tests/box/bounty/bt62-record.test.ts';

const linesOf = file => existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(line => line !== '') : [];
const schemaBase = schema => /^(.+)@\d+$/.exec(schema)?.[1] ?? schema;
const schemaOf = line => line.startsWith('field ') || line.startsWith('values ') ? line.split(' ')[1] : line.startsWith('schema ') ? line.split(' ')[1] : null;
const versionMigrations = (before, after) => {
  const versions = lines => new Map(lines.filter(line => line.startsWith('schema ')).map(line => { const schema = line.split(' ')[1]; return [schemaBase(schema), Number(schema.match(/@(\d+)$/)?.[1] ?? 0)]; }));
  const oldVersions = versions(before);
  const newVersions = versions(after);
  return new Set([...newVersions].flatMap(([base, version]) => oldVersions.has(base) && version > oldVersions.get(base) ? [base] : []));
};
const valueParts = line => {
  if (!line.startsWith('values ')) return null;
  const [_, schema, path, openness, encoded = ''] = line.split(' ');
  return { schema, path, openness, values: encoded === '' ? [] : encoded.split('|').map(value => decodeURIComponent(value)) };
};
const fieldKey = line => line.split(' ').slice(1, 3).join(' ');

function classifyLines(before, after) {
  const compatible = [];
  const breaking = [];
  const versioned = [];
  const migrations = versionMigrations(before, after);
  const migrated = line => {
    const schema = schemaOf(line);
    return schema !== null && migrations.has(schemaBase(schema));
  };
  const add = (kind, text) => { (kind === 'compatible' ? compatible : kind === 'versioned' ? versioned : breaking).push(text); };
  const addBreakingOrVersioned = (line, text) => add(migrated(line) ? 'versioned' : 'breaking', text);

  const beforeValues = new Map(before.map(line => [line.startsWith('values ') ? `${valueParts(line).schema} ${valueParts(line).path}` : '', line]).filter(([key]) => key !== ''));
  const afterValues = new Map(after.map(line => [line.startsWith('values ') ? `${valueParts(line).schema} ${valueParts(line).path}` : '', line]).filter(([key]) => key !== ''));
  const valueKeys = new Set([...beforeValues.keys(), ...afterValues.keys()]);
  for (const key of [...valueKeys].sort()) {
    const oldLine = beforeValues.get(key);
    const newLine = afterValues.get(key);
    if (oldLine === newLine) continue;
    if (oldLine === undefined) { compatible.push(`added ${newLine}`); continue; }
    if (newLine === undefined) { addBreakingOrVersioned(oldLine, `removed ${oldLine}`); continue; }
    const oldParts = valueParts(oldLine);
    const newParts = valueParts(newLine);
    if (oldParts.openness !== newParts.openness) addBreakingOrVersioned(newLine, `changed openness ${newParts.schema} ${newParts.path} ${oldParts.openness} to ${newParts.openness}`);
    for (const value of newParts.values.filter(value => !oldParts.values.includes(value))) {
      const text = `added value ${newParts.schema} ${newParts.path} ${value}`;
      if (newParts.openness === 'open') compatible.push(text);
      else addBreakingOrVersioned(newLine, text);
    }
    for (const value of oldParts.values.filter(value => !newParts.values.includes(value))) addBreakingOrVersioned(newLine, `removed value ${newParts.schema} ${newParts.path} ${value}`);
  }

  const beforeSet = new Set(before.filter(line => !line.startsWith('values ')));
  const afterSet = new Set(after.filter(line => !line.startsWith('values ')));
  const added = after.filter(line => !line.startsWith('values ') && !beforeSet.has(line));
  const removed = before.filter(line => !line.startsWith('values ') && !afterSet.has(line));
  const removedFieldKeys = new Set(removed.filter(line => line.startsWith('field ')).map(fieldKey));
  const addedFieldKeys = new Set(added.filter(line => line.startsWith('field ')).map(fieldKey));
  for (const line of added.sort()) {
    if (line.startsWith('field ') && removedFieldKeys.has(fieldKey(line))) addBreakingOrVersioned(line, `changed type ${line}`);
    else if (line.startsWith('schema ') && migrations.has(schemaBase(line.split(' ')[1]))) versioned.push(`schema version ${line}`);
    else compatible.push(`added ${line}`);
  }
  for (const line of removed.sort()) {
    if (line.startsWith('schema ') && migrations.has(schemaBase(line.split(' ')[1]))) { versioned.push(`schema version removed ${line}`); continue; }
    if (line.startsWith('field ') && addedFieldKeys.has(fieldKey(line))) addBreakingOrVersioned(line, `changed type removed ${line}`);
    else if (line.startsWith('field ')) addBreakingOrVersioned(line, `removed ${line}`);
    else addBreakingOrVersioned(line, `removed ${line}`);
  }
  return {
    compatible: [...new Set(compatible)].sort(),
    breaking: [...new Set(breaking)].sort(),
    versioned: [...new Set(versioned)].sort()
  };
}

const printClassification = result => {
  for (const line of result.compatible) console.log(`compatible: ${line}`);
  for (const line of result.versioned) console.log(`versioned: ${line}`);
  for (const line of result.breaking) console.log(`breaking: ${line}`);
};

const args = process.argv.slice(2);
if (args[0] === '--classify' && args.length === 3) {
  process.stdout.write(JSON.stringify(classifyLines(linesOf(args[1]), linesOf(args[2]))) + '\n');
  process.exit(0);
}
const write = args[0] === '--write';
if (args.length > (write ? 1 : 0) || args[0] === '--classify') {
  console.error('usage: node scripts/surface.mjs [--write]');
  process.exit(2);
}

if (await runNode(join(root, 'scripts', 'workspace.mjs'), ['build']) !== 0) {
  console.error('surface: the build failed; nothing was compared');
  process.exit(1);
}

const derive = async () => {
  const parts = mkdtempSync(join(tmpdir(), 'box-surface-'));
  try {
    const code = await runNode(join(root, 'scripts', 'suite.mjs'), ['box', '--suite', 'bounty', ...FILES], { env: { ...process.env, BT62_WRITE: parts } });
    if (code !== 0) console.error('surface: an owner test failed while deriving; using the parts it still wrote, and the surface comparison names whether the failure is a surface change');
    const files = readdirSync(parts).filter(name => name.endsWith('.txt'));
    // static.txt plus one fields-<owner>.txt per owner: a part that did not write means its test did not reach the check.
    if (!files.includes('static.txt') || files.length !== FILES.length) {
      console.error(`surface: expected ${FILES.length} parts, got ${files.length} (${files.join(', ')}); nothing was compared`);
      process.exit(1);
    }
    return [...new Set(files.flatMap(name => readFileSync(join(parts, name), 'utf8').split('\n').filter(line => line !== '')))].sort();
  } finally {
    rmSync(parts, { recursive: true, force: true });
  }
};

const derived = await derive();
const before = linesOf(RECORD);
const result = classifyLines(before, derived);
printClassification(result);
if (result.compatible.length + result.versioned.length + result.breaking.length === 0) {
  console.log(`surface: the built tool matches tests/box/bounty/SURFACE.txt (${derived.length} lines)`);
  process.exit(0);
}
if (!write) {
  console.error('surface: the built tool differs from tests/box/bounty/SURFACE.txt; compatible differences may be written, breaking differences need @2 or a fix');
  process.exit(1);
}
if (result.breaking.length > 0) {
  console.error(`surface: refusing --write: ${result.breaking[0]} — a removed or renamed field, a changed type, a closed field gaining a value, or a removed value needs that document at @2`);
  process.exit(1);
}
writeFileSync(RECORD, derived.join('\n') + '\n');
console.log(`surface: wrote tests/box/bounty/SURFACE.txt (${derived.length} lines); review its diff`);
