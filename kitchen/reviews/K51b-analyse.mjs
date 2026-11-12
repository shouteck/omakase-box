// K51b: reads the extraction (node kitchen/reviews/K51b-extract.mjs > extraction.json) and prints the numbers the review quotes.
// Run: node kitchen/reviews/K51b-analyse.mjs extraction.json
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));

// The three hard stops as refusal names, from CONTRACTS guarantees C1, P1, P2, P4, R3, D4, O1 and the refusals beside them.
const STOPS = {
  'HS1 never-ship': ['never-ship-input', 'github-never-ship', 'github-include-never-ship', 'publish-list-never-ship', 'answer-never-ship'],
  'HS2 private repository': ['github-private-repository'],
  'HS3 owner authority': ['owner-allow-needed', 'owner-answer-needed', 'merge-held', 'merge-approval-agent', 'settings-hard-stop', 'project-claims-list', 'project-claims-reward', 'authority-arguments']
};
const stopOf = new Map();
for (const [stop, list] of Object.entries(STOPS)) for (const name of list) stopOf.set(name, stop);

const rows = [];
const proof = new Map(data.refusalNames.map(name => [name, []]));
for (const file of data.files) {
  const inBody = new Set(file.tests.flatMap(test => test.refusals));
  const tableNames = file.fileRefusals.filter(name => !inBody.has(name));
  const tableTests = file.tests.filter(test => test.eachTable).length;
  let hardStop = 0;
  const byStop = {};
  for (const test of file.tests) {
    for (const name of test.refusals) proof.get(name)?.push(`${file.file}::${test.title}`);
    const stops = new Set(test.refusals.map(name => stopOf.get(name)).filter(Boolean));
    if (stops.size > 0) { hardStop += 1; for (const stop of stops) byStop[stop] = (byStop[stop] ?? 0) + 1; }
  }
  // names that appear only in a table outside any test body (it.each rows): proof by the file's table tests
  for (const name of tableNames) proof.get(name)?.push(`${file.file}::(table in the file, ${tableTests} table test(s))`);
  const tableStops = new Set(tableNames.map(name => stopOf.get(name)).filter(Boolean));
  rows.push({ file: file.file, tests: file.tests.length, hardStop, byStop, tableNames: tableNames.length, tableStops: [...tableStops], anyRefusal: file.tests.filter(test => test.refusals.length > 0).length });
}

// The reading: tests judged by hand (K51b-guards.json), laid over the mechanical hard-stop tests above. Every judged line must match a real test.
const judged = JSON.parse(readFileSync(new URL('./K51b-guards.json', import.meta.url), 'utf8')).judged;
const keyOf = name => name.startsWith('platform/') ? `tests/${name}.test.ts` : `tests/box/bounty/${name}.test.ts`;
const mismatches = [];
const classOf = new Map(); // "file:line" -> set of classes
const addClass = (file, line, cls) => { const key = `${file}:${line}`; (classOf.get(key) ?? classOf.set(key, new Set()).get(key)).add(cls); };
for (const entry of judged) {
  const file = data.files.find(candidate => candidate.file === keyOf(entry.file));
  for (const line of entry.lines) {
    if (file === undefined || !file.tests.some(test => test.line === line)) mismatches.push(`${entry.file}:${line}`);
    else addClass(file.file, line, entry.stop);
  }
}
for (const file of data.files) for (const test of file.tests) for (const name of test.refusals) {
  const stop = stopOf.get(name);
  if (stop !== undefined) addClass(file.file, test.line, stop.slice(0, 3));
}
const byStop = {};
for (const classes of classOf.values()) for (const cls of classes) byStop[cls] = (byStop[cls] ?? 0) + 1;
const perFile = data.files.map(file => {
  const counts = { guard: 0, scan: 0, related: 0, byName: 0 };
  for (const test of file.tests) {
    const classes = classOf.get(`${file.file}:${test.line}`);
    if (classes === undefined) continue;
    if ([...classes].some(cls => cls.startsWith('HS'))) counts.guard += 1;
    else if (classes.has('SCAN')) counts.scan += 1;
    else counts.related += 1;
  }
  return { file: file.file, tests: file.tests.length, ...counts };
});

const out = { stops: STOPS, totalTests: rows.reduce((sum, row) => sum + row.tests, 0), hardStopTests: rows.reduce((sum, row) => sum + row.hardStop, 0), judgedMismatches: mismatches, byStop, perFile, rows, proof: Object.fromEntries(proof) };
process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
