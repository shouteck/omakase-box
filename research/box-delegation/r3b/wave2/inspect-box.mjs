// Host side, reads only a copied box.json (data, no project code is executed).
//   node research/box-delegation/r3b/wave2/inspect-box.mjs <box.json>
// Prints the selection size, the recorded base and paired results, and a disclosure scan.
import { readFileSync } from 'node:fs';

const text = readFileSync(process.argv[2], 'utf8');
const box = JSON.parse(text);
const sum = list => list.reduce((total, file) => total + file.bytes, 0);
const owner = box.files.filter(file => file.origin !== 'generated');
const editable = box.files.filter(file => file.origin === 'editable');
console.log(`keys: ${Object.keys(box).join(', ')}`);
console.log(`files recorded: ${box.files.length}; owner files: ${owner.length}, ${sum(owner)} bytes; editable: ${editable.length}, ${sum(editable)} bytes`);
console.log(`product disclosure: ${JSON.stringify(box.disclosure)}`);
console.log(`warnings: ${JSON.stringify(box.warnings)}`);
for (const record of box.baseChecks) {
  console.log(`base  ${record.name} context=${record.context} role=${record.role} exit=${record.exit} result=${record.result} seconds=${record.seconds} logChars=${record.log.length}`);
}
for (const pair of box.paired) {
  console.log(`pair  ${pair.name}: ${pair.program} ${pair.argv.slice(0, 2).join(' ')} ...`);
  for (const side of ['owner', 'box']) {
    const observed = pair[side];
    console.log(`      ${side}: exit=${observed.exit} result=${observed.result} seconds=${observed.seconds} outputSha256=${observed.outputSha256} log=${JSON.stringify(observed.log.slice(0, 160))}`);
  }
  console.log(`      match: exit ${pair.owner.exit === pair.box.exit}, result ${pair.owner.result === pair.box.result}, output digest ${pair.owner.outputSha256 === pair.box.outputSha256}`);
}
const needles = ['2615', 'pull', 'ID_Continue', 'github', 'shout', 'private-task', 'Desktop', 'C:\\\\', '/src/', 'commander', 'tj/', 'a9f06dd', 'ae60352', 'kitchen', 'r3b', '<root>', 'requester'];
console.log('disclosure scan of box.json (case-insensitive count):');
for (const needle of needles) {
  const count = text.toLowerCase().split(needle.toLowerCase()).length - 1;
  console.log(`  ${JSON.stringify(needle)}: ${count}`);
}
