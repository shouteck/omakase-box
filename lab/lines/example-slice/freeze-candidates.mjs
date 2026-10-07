// Public metadata only. Never request titles, bodies, changed files or patches.
import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const destination = new URL('./replay-1/candidate-metadata.json', import.meta.url);
const panel = ['sindresorhus/ky', 'colinhacks/zod', 'pallets/click', 'pallets/itsdangerous'];
const knownExposed = {'pallets/click': [3739, 3304, 3768, 351, 2380, 3407, 3858]};
export function choose(snapshot) {
  if (snapshot.incomplete_results) throw new Error('Incomplete search');
  const rows = [...snapshot.items].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.number-b.number);
  const humans = rows.filter(row => row.user.type !== 'Bot' && !row.user.login.endsWith('[bot]'));
  const cutoff = humans[19];
  if (rows.length === 100 && (!cutoff || rows.at(-1).created_at === cutoff.created_at)) {
    throw new Error('Pagination required to resolve human cutoff');
  }
  return humans.slice(0,20).map((row,i) => ({...row, position:i+1,
    partition:i<5 ? 'development':'confirmation',
    exposure:(knownExposed[snapshot.repository] ?? []).includes(row.number) ? 'previously-exposed':'no-known-prior-exposure'}));
}
if (process.argv.includes('--verify')) {
  const saved = JSON.parse(readFileSync(destination,'utf8'));
  for (const snapshot of saved.repositories) {
    if (JSON.stringify(choose(snapshot)) !== JSON.stringify(snapshot.candidates)) throw new Error('Candidate mismatch');
  }
  console.log('Saved metadata selection reproduced for all four projects.');
} else {
  if (existsSync(destination)) throw new Error('Frozen snapshot exists: verify it; do not overwrite');
  const repositories = [];
  for (const repository of panel) {
    const query = `repo:${repository} is:pr is:merged created:2026-01-01..2026-09-30 merged:2026-01-01..2026-09-30`;
    const result = spawnSync('gh', ['api','-X','GET','search/issues','-f',`q=${query}`,'-f','sort=created',
      '-f','order=asc','-f','per_page=100','-f','page=1','--jq',
      '{total_count,incomplete_results,items:[.items[]|{number,created_at,updated_at,html_url,user:{login:.user.login,type:.user.type}}]}'],
      {encoding:'utf8', timeout:60000, maxBuffer:1024*1024});
    if (result.status !== 0) throw new Error(`Public metadata fetch failed for ${repository}: ${result.stderr}`);
    const snapshot = {repository,query,captured_at:new Date().toISOString(),...JSON.parse(result.stdout)};
    snapshot.candidates = choose(snapshot);
    repositories.push(snapshot);
    console.log(`${repository}: ${snapshot.total_count} matches; ${snapshot.candidates.length} frozen candidates`);
  }
  mkdirSync(fileURLToPath(new URL('./replay-1/',import.meta.url)), {recursive:true});
  writeFileSync(destination, JSON.stringify({version:1,kind:'candidate metadata, not final task manifest',
    ordering:'created_at ascending, numeric PR tie break; first 100 API rows; human filter before first 20',
    prior_exposure_audit:'Local lab records: public PR URLs only. Known click PR IDs marked without refill. No titles/bodies/fixes requested by this collector.',
    repositories},null,2)+'\n');
}
