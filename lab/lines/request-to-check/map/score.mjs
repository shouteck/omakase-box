// Agreement between two labellers of the map. Usage: node score.mjs <a.csv> <b.csv>
// Prints raw agreement and Cohen's kappa for the label and for the observable column,
// the confusion table, each labeller's counts, and the ids they disagree on.
import { readFileSync } from 'node:fs';

const read = path => new Map(readFileSync(path, 'utf8').trim().split(/\r?\n/).slice(1).map(line => {
  const [id, label, observable, ...notes] = line.split(',');
  return [id, { label: label.trim(), observable: observable.trim(), notes: notes.join(',') }];
}));
const [a, b] = process.argv.slice(2).map(read);
const ids = [...a.keys()].filter(id => b.has(id));
if (ids.length !== a.size || ids.length !== b.size) console.log(`warning: ${a.size} and ${b.size} rows, ${ids.length} shared`);

function kappa(field) {
  const values = [...new Set(ids.flatMap(id => [a.get(id)[field], b.get(id)[field]]))].sort();
  const n = ids.length;
  const agree = ids.filter(id => a.get(id)[field] === b.get(id)[field]).length / n;
  const chance = values.reduce((sum, value) => sum + (ids.filter(id => a.get(id)[field] === value).length / n) * (ids.filter(id => b.get(id)[field] === value).length / n), 0);
  return { values, agree, kappa: (agree - chance) / (1 - chance) };
}

for (const field of ['label', 'observable']) {
  const k = kappa(field);
  console.log(`${field}: agreement ${(k.agree * 100).toFixed(1)}% of ${ids.length}, Cohen's kappa ${k.kappa.toFixed(2)}`);
}
const { values } = kappa('label');
console.log('\nconfusion (rows = first file, columns = second file)');
console.log(''.padEnd(10) + values.map(v => v.padStart(9)).join(''));
for (const row of values) console.log(row.padEnd(10) + values.map(col => String(ids.filter(id => a.get(id).label === row && b.get(id).label === col).length).padStart(9)).join(''));
console.log('\ncounts');
for (const value of values) console.log(value.padEnd(10) + String(ids.filter(id => a.get(id).label === value).length).padStart(4) + String(ids.filter(id => b.get(id).label === value).length).padStart(4));
console.log('\ndisagreements');
for (const id of ids) if (a.get(id).label !== b.get(id).label) console.log(`${id.padEnd(14)} ${a.get(id).label.padEnd(9)} ${b.get(id).label.padEnd(9)} | ${a.get(id).notes} | ${b.get(id).notes}`);
