#!/usr/bin/env node
// PF37: which migration files the live board still needs, from what the board itself has recorded. It changes nothing and
// reaches no account: it prints the commands for the owner to run.
//   node migrate.mjs                          prints the one read that asks the board what it has recorded
//   node migrate.mjs --applied <answer.json>  prints the command for each file in migrations/ not yet recorded, in order
// (--migrations <folder> is for the tests.) Run the printed lines from packages/box-platform, migration first, then deploy.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WRANGLER = 'node node_modules/wrangler/bin/wrangler.js';
const DATABASE = 'open-bounty-board';
const args = process.argv.slice(2);
const option = name => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
const folder = option('--migrations') ?? join(here, 'migrations');
const answer = option('--applied');

if (answer === undefined) {
  console.log('1. Ask the board which migrations it has recorded, saving the answer outside the repository:');
  console.log(`   ${WRANGLER} d1 execute ${DATABASE} --remote --json --command "SELECT name FROM migrations" > ../../../applied.json`);
  console.log('2. Then: node migrate.mjs --applied ../../../applied.json');
  console.log('   (A board from before PF37 answers "no such table: migrations"; step 2 then names migrations/pf37.sql first.)');
  process.exit(0);
}
if (!existsSync(answer)) { console.error(`migrate: ${answer} does not exist; next: run node migrate.mjs and save the answer it asks for`); process.exit(2); }

// `wrangler d1 execute --json` answers a list of result sets; a board from before PF37 answers with an error instead.
let recorded = null;
try {
  const parsed = JSON.parse(readFileSync(answer, 'utf8'));
  const sets = Array.isArray(parsed) ? parsed : [parsed];
  const rows = sets.flatMap(set => Array.isArray(set?.results) ? set.results : []);
  if (sets.some(set => set?.success === true)) recorded = new Set(rows.map(row => row?.name).filter(name => typeof name === 'string'));
} catch {
  console.error(`migrate: ${answer} is not the JSON wrangler prints; next: run step 1 again and save its whole answer`);
  process.exit(2);
}

const files = readdirSync(folder).filter(name => name.endsWith('.sql')).sort();
const missing = recorded === null ? ['pf37.sql', ...files.filter(name => name !== 'pf37.sql' && name > 'pf37.sql')] : files.filter(name => !recorded.has(name));
if (recorded === null) console.log('The board has no record yet (a board from before PF37): pf37.sql records the seven older files, then any newer ones follow.');
if (missing.length === 0) { console.log('Nothing to apply: the board has recorded every file in migrations/.'); process.exit(0); }
console.log(`To apply, from packages/box-platform, in this order, before deploying the code that needs them (${missing.length}):`);
for (const name of missing) console.log(`  ${WRANGLER} d1 execute ${DATABASE} --remote --file migrations/${name}`);
