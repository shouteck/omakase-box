// Scores two labellers of outside sample 1 (guide version 1).
// Usage: node score.mjs labels-a.csv labels-b.csv
// The sample (40 issues) and the known cases (commander-*) are always reported apart.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = path => new Map(readFileSync(join(here, path), 'utf8').trim().split(/\r?\n/).slice(1).map(line => {
  const [id, about, source, role, observable, determined, ...notes] = line.split(',');
  return [id.trim(), { about: about.trim(), source: source.trim(), role: role.trim(), observable: observable.trim(), determined: determined.trim(), notes: notes.join(',').trim() }];
}));
const [fileA, fileB] = process.argv.slice(2);
const a = read(fileA), b = read(fileB);
const order = readFileSync(join(here, 'ids.txt'), 'utf8').trim().split(/\r?\n/);
const groups = new Map(JSON.parse(readFileSync(join(here, 'issue-ids.json'), 'utf8')).map(entry => [entry.id, entry.group]));
const issueOf = id => id.slice(0, id.lastIndexOf('.'));
const known = id => id.startsWith('commander-');
const pct = (n, d) => d ? `${n} of ${d} (${Math.round(100 * n / d)}%)` : `${n} of ${d}`;

function kappa(ids, field) {
  const n = ids.length;
  if (!n) return 'no cases';
  const values = [...new Set(ids.flatMap(id => [a.get(id)[field], b.get(id)[field]]))];
  const agree = ids.filter(id => a.get(id)[field] === b.get(id)[field]).length / n;
  const chance = values.reduce((sum, v) => sum + (ids.filter(id => a.get(id)[field] === v).length / n) * (ids.filter(id => b.get(id)[field] === v).length / n), 0);
  return `agreement ${Math.round(agree * 1000) / 10}% of ${n}, kappa ${chance === 1 ? 'undefined (one value only)' : ((agree - chance) / (1 - chance)).toFixed(2)}`;
}
function table(ids, field, title) {
  const values = [...new Set(ids.flatMap(id => [a.get(id)[field], b.get(id)[field]]))].sort();
  console.log(`\n${title} (rows = ${fileA}, columns = ${fileB})`);
  console.log(''.padEnd(10) + values.map(v => v.padStart(9)).join('') + '    total');
  for (const row of values) console.log(row.padEnd(10) + values.map(col => String(ids.filter(id => a.get(id)[field] === row && b.get(id)[field] === col).length).padStart(9)).join('') + String(ids.filter(id => a.get(id)[field] === row).length).padStart(9));
  console.log('total'.padEnd(10) + values.map(col => String(ids.filter(id => b.get(id)[field] === col).length).padStart(9)).join(''));
}

for (const [name, keep] of [['SAMPLE (40 issues, 4 repositories)', id => !known(id)], ['KNOWN CASES (commander.js, from kitchen R3b-1; not part of the sample)', known]]) {
  console.log(`\n==================== ${name}`);
  const cond = order.filter(id => keep(id) && !id.endsWith('.T'));
  const tests = order.filter(id => keep(id) && id.endsWith('.T'));
  const bothResult = cond.filter(id => a.get(id).about === 'RESULT' && b.get(id).about === 'RESULT');
  const bothOutcome = bothResult.filter(id => a.get(id).role === 'OUTCOME' && b.get(id).role === 'OUTCOME');
  console.log(`conditions ${cond.length}, test questions ${tests.length}`);
  console.log('about:      ' + kappa(cond, 'about'));
  console.log('source:     ' + kappa(bothResult, 'source') + '  [conditions both call RESULT]');
  console.log('role:       ' + kappa(bothResult, 'role') + '  [conditions both call RESULT]');
  console.log('observable: ' + kappa(bothResult, 'observable') + '  [conditions both call RESULT]');
  console.log('determined: ' + kappa(tests, 'determined'));
  table(cond, 'about', 'about');
  table(bothOutcome, 'source', 'source, among conditions both call RESULT and OUTCOME');
  table(tests, 'determined', 'determined');

  const issues = [...new Set(cond.map(issueOf))];
  for (const [who, labels] of [[fileA, a], [fileB, b]]) {
    const none = issues.filter(issue => cond.filter(id => issueOf(id) === issue).every(id => labels.get(id).about === 'NONE'));
    const withRequestOutcome = issues.filter(issue => cond.some(id => issueOf(id) === issue && labels.get(id).about === 'RESULT' && labels.get(id).role === 'OUTCOME' && labels.get(id).source === 'REQUEST'));
    const anyOutcome = issues.filter(issue => cond.some(id => issueOf(id) === issue && labels.get(id).about === 'RESULT' && labels.get(id).role === 'OUTCOME'));
    console.log(`\n${who}: issues with no request for change ${pct(none.length, issues.length)}; issues with at least one OUTCOME ${pct(anyOutcome.length, issues.length)}; of those, at least one OUTCOME whose check is in the request text ${pct(withRequestOutcome.length, anyOutcome.length)}`);
    for (const group of ['open', 'fixed']) {
      const g = anyOutcome.filter(issue => (groups.get(issue) || '').startsWith(group));
      if (g.length) console.log(`   ${group}: ${pct(g.filter(issue => withRequestOutcome.includes(issue)).length, g.length)} have an OUTCOME with source REQUEST`);
    }
  }
  console.log('\ndisagreements on determined');
  for (const id of tests) if (a.get(id).determined !== b.get(id).determined) console.log(`  ${id.padEnd(18)} ${a.get(id).determined.padEnd(8)} ${b.get(id).determined.padEnd(8)} | ${a.get(id).notes} | ${b.get(id).notes}`);
  console.log('\nagreed PARTLY or NO on determined');
  for (const id of tests) if (a.get(id).determined === b.get(id).determined && ['PARTLY', 'NO'].includes(a.get(id).determined)) console.log(`  ${id.padEnd(18)} ${a.get(id).determined.padEnd(8)} | ${a.get(id).notes} | ${b.get(id).notes}`);
}
