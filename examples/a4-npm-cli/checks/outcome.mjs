import { paint } from '../src/paint.js';

// Outcome: the requested change — paint(text, color) wraps the text in the
// ANSI color code for 'red' (31), 'green' (32) or 'blue' (34) and resets the
// foreground with code 39. Unknown colors and empty text pass through
// unchanged. Output is intentionally fixed text: the same declaration runs in
// the owner base and the isolated Box and the results are compared byte-wise.
const CASES = [
  ['hi', 'red', '\x1b[31mhi\x1b[39m'],
  ['ok', 'green', '\x1b[32mok\x1b[39m'],
  ['sky', 'blue', '\x1b[34msky\x1b[39m'],
  ['a b', 'red', '\x1b[31ma b\x1b[39m'],
  ['hi', 'pink', 'hi'],
  ['', 'red', '']
];

let failures = 0;
for (const [text, color, want] of CASES) {
  let got;
  try { got = paint(text, color); } catch { got = '<threw>'; }
  if (got !== want) {
    failures += 1;
    console.log(`OUTCOME FAIL paint(${JSON.stringify(text)}, ${JSON.stringify(color)}) expected ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
  }
}
if (failures > 0) {
  console.log(`a4-npm-cli outcome: ${failures} failing case(s)`);
  process.exit(1);
}
console.log('a4-npm-cli outcome: all cases pass');
