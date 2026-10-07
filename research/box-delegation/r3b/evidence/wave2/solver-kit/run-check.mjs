// Runs inside the container, fed on standard input by run.sh. Not part of the Box.
// The commands below are copied from the Box's own box.json (the "recipient" entries of
// "commands"); each is started directly with no shell, in /work, and its own exit code
// is what gets reported.
import { spawnSync } from 'node:child_process';

const GUARD_FILES = [
  'tests/args.variadic.test.js', 'tests/argument.variadic.test.js', 'tests/option.bad-flags.test.js',
  'tests/option.chain.test.js', 'tests/options.bool.combo.test.js', 'tests/options.bool.small.combined.test.js',
  'tests/options.bool.test.js', 'tests/options.camelcase.test.js', 'tests/options.choices.test.js',
  'tests/options.conflicts.test.js', 'tests/options.custom-processing.test.js', 'tests/options.default.test.js',
  'tests/options.dual-options.test.js', 'tests/options.env.test.js', 'tests/options.flags.test.js',
  'tests/options.getset.test.js', 'tests/options.implies.test.js', 'tests/options.mandatory.test.js',
  'tests/options.optional.test.js', 'tests/options.opts.test.js', 'tests/options.optsWithGlobals.test.js',
  'tests/options.preset.test.js', 'tests/options.registerClash.test.js', 'tests/options.required.test.js',
  'tests/options.twice.test.js', 'tests/options.values.test.js', 'tests/options.version.test.js'
];
const COMMANDS = {
  'box-variadic-outcome': { role: 'outcome', program: 'node', args: ['--test', '--test-reporter=lcov', 'tests/options.variadic.test.js'] },
  'box-options-guard': { role: 'guard', program: 'node', args: ['--test', '--test-reporter=dot', ...GUARD_FILES] }
};

const wanted = process.argv[2];
const names = wanted === '--all' ? Object.keys(COMMANDS) : [wanted];
let worst = 0;
for (const name of names) {
  const command = COMMANDS[name];
  if (command === undefined) {
    console.error(`unknown check '${name}'. Known: ${Object.keys(COMMANDS).join(', ')}`);
    process.exit(64);
  }
  console.log(`--- ${name} (${command.role}): ${command.program} ${command.args.slice(0, 3).join(' ')}${command.args.length > 3 ? ' ...' : ''}`);
  const run = spawnSync(command.program, command.args, { cwd: '/work', stdio: 'inherit' });
  const code = run.status === null ? 124 : run.status;
  console.log(`--- ${name} exit=${code}${run.signal ? ` signal=${run.signal}` : ''}${run.error ? ` error=${run.error.message}` : ''}`);
  if (code !== 0 && worst === 0) worst = code;
}
process.exit(worst);
