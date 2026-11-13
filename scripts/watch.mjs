#!/usr/bin/env node
// PF37: is the board up, and still reading GitHub? Run every 30 minutes by .github/workflows/watch.yml; a failed run is the
// notice (GitHub emails the repository's owner). It reads public addresses only and sends nothing anywhere.
//   node scripts/watch.mjs <board address> [--max-age-minutes 60]
// Exit 0: the front page answers 200 and /numbers.json says the board read GitHub within the allowed age, with no error.
// Exit 1, with one sentence: what is wrong. The board reads GitHub at most every 15 minutes, numbers.json keeps its answer
// for up to 15 more (numbers.ts NUMBERS_FRESH_MS) and the cron can slip: a healthy board shows up to about 30 minutes, so
// the default of 60 says "it stopped", not "it was slow".
const [address, ...rest] = process.argv.slice(2);
if (address === undefined || !/^https?:\/\/[^/]+$/.test(address.replace(/\/$/, ''))) {
  console.error('usage: node scripts/watch.mjs <board address, e.g. https://open-bounty-board.box-platform.workers.dev> [--max-age-minutes 60]');
  process.exit(2);
}
const base = address.replace(/\/$/, '');
const at = rest.indexOf('--max-age-minutes');
const maxAge = at < 0 ? 60 : Number(rest[at + 1]);
// Each answer is read to its end, and a failure sets the exit code and returns: ending the process with an answer still
// open crashed Node on Windows (exit 0xC0000409, PF37).
const get = async path => {
  try {
    const answer = await fetch(`${base}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    return { status: answer.status, text: await answer.text() };
  } catch { return null; }
};

async function check() {
  const front = await get('/');
  if (front === null) return `${base}/ could not be reached (no answer within 20 seconds, or no connection).`;
  if (front.status !== 200) return `the front page ${base}/ answered ${front.status}, not 200.`;
  const numbers = await get('/numbers.json');
  if (numbers === null) return `${base}/numbers.json could not be reached (no answer within 20 seconds, or no connection).`;
  if (numbers.status !== 200) return `${base}/numbers.json answered ${numbers.status}, not 200.`;
  let facts;
  try { facts = JSON.parse(numbers.text); } catch { return `${base}/numbers.json did not answer JSON.`; }
  if (typeof facts?.stale === 'string' && facts.stale !== '') return `the board says its last read of GitHub failed: ${facts.stale.slice(0, 200)}`;
  if (typeof facts?.read_at !== 'string') return 'the board has never read GitHub (numbers.json has no read_at).';
  const minutes = Math.floor((Date.now() - Date.parse(facts.read_at)) / 60000);
  if (!(minutes <= maxAge)) return `the board has not read GitHub for ${minutes} minutes (allowed: ${maxAge}); its last read was ${facts.read_at}.`;
  console.log(`watch: ${base} is up and read GitHub ${minutes} minute(s) ago.`);
  return null;
}

const problem = await check();
if (problem !== null) { console.error(`watch: ${problem}`); process.exitCode = 1; }
