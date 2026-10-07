// Held-back probe. Runs INSIDE a container (fed on stdin), network off. Never shown to the solver.
//   node --input-type=module - <tree> < probe.mjs
// Loads the library from <tree>/index.js and prints one JSON line per probe. It judges nothing:
// each line is what the library returned. Not part of the product's verdict.
import { pathToFileURL } from 'node:url';

const tree = process.argv[2];
const { Command, Option } = await import(pathToFileURL(`${tree}/index.js`).href);

const variadic = flags => { try { return new Option(flags).variadic; } catch (error) { return `threw: ${error.message}`; } };
const parse = (flags, argv) => {
  try {
    const program = new Command().exitOverride().configureOutput({ writeErr: () => {}, writeOut: () => {} }).addOption(new Option(flags));
    program.parse(argv, { from: 'user' });
    return program.opts();
  } catch (error) { return `threw: ${error.message}`; }
};
const cp = text => [...text].map(ch => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');

const probes = [
  // The issue's own example.
  ['issue-example-flag', 'variadic', '--tag <值...>'],
  ['issue-example-parse', 'parse', '--tag <值...>', ['--tag', 'one', 'two']],
  // Existing behaviour that must not move.
  ['ascii-required', 'variadic', '--tag <value...>'],
  ['ascii-optional', 'variadic', '--tag [value...]'],
  ['ascii-parse', 'parse', '--tag <value...>', ['--tag', 'one', 'two']],
  ['separator-ascii', 'variadic', '--tag <value,...>'],
  ['separator-unicode', 'variadic', '--tag <值,...>'],
  ['not-variadic', 'variadic', '--tag <值>'],
  // Neighbours where a letter/number/mark rule and an identifier-continue rule could differ.
  ['combining-mark-after-letter', 'variadic', '--tag <é...>'],
  ['connector-undertie', 'variadic', '--tag <value‿...>'],
  ['underscore', 'variadic', '--tag <value_...>'],
  ['superscript-two', 'variadic', '--tag <x²...>'],
  ['middle-dot', 'variadic', '--tag <l·...>'],
  ['mark-after-comma', 'variadic', '--tag <a,́...>']
];
for (const [name, kind, flags, argv] of probes) {
  const placeholder = flags.slice(flags.indexOf(' ') + 1);
  const result = kind === 'variadic' ? variadic(flags) : parse(flags, argv);
  console.log(JSON.stringify({ probe: name, kind, placeholder: cp(placeholder), ...(argv ? { argv } : {}), result }));
}
