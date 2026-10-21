#!/usr/bin/env node
// A local stand-in for the board's MCP server, answering find_bounties and
// get_bounty from the static sample files. Plain Node, no dependencies,
// read-only, no network.
//
//   node standin.mjs find_bounties '{"language":"TypeScript"}'
//   node standin.mjs get_bounty '{"id":"bt-0d7e4a3c8b65"}'
//   node standin.mjs --stdio        (an MCP server over stdio, JSON-RPC 2.0)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = [join(here, 'feed'), join(here, '..', 'public')].find(d => existsSync(join(d, 'bounties.json')));
if (!dataDir) { console.error('No sample feed found next to this script (feed/bounties.json). Next: run it from its own folder.'); process.exit(2); }
const tools = JSON.parse(readFileSync(join(dataDir, 'mcp', 'tools.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(dataDir, 'bounties.json'), 'utf8'));
const details = Object.fromEntries(readdirSync(join(dataDir, 'bounties')).filter(f => f.endsWith('.json'))
  .map(f => { const d = JSON.parse(readFileSync(join(dataDir, 'bounties', f), 'utf8')); return [d.bounty.id, d.bounty]; }));
const OPEN = new Set(['open', 'solutions-waiting']);
const [MAX, DEF, LATE_DAYS] = [25, 10, 14];

const fail = (field, reason, allowed) => ({ error: tools.errors['bad-filter'].replace('{field}', field).replace('{reason}', reason).replace('{allowed}', allowed) });
const ENUMS = { solutions: ['none', 'some'], owner_record: ['confirmed-payments', 'confirmed-none-late', 'no-history'], approved_by: ['owner-this-bounty', 'owner-standing-rule'], sort: ['newest', 'reward'] };
const KNOWN = new Set(['language', 'repository', 'min_reward', 'max_age_days', 'query', 'cursor', 'limit', ...Object.keys(ENUMS)]);

export function findBounties(q = {}) {
  for (const k of Object.keys(q)) if (!KNOWN.has(k)) return fail(k, 'not a filter', [...KNOWN].join(', '));
  for (const [k, vals] of Object.entries(ENUMS)) if (q[k] !== undefined && !vals.includes(q[k])) return fail(k, `"${q[k]}" is not allowed`, vals.join(', '));
  for (const k of ['min_reward', 'max_age_days']) if (q[k] !== undefined && !(Number.isInteger(q[k]) && q[k] >= 0)) return fail(k, 'must be a whole number at or above 0', 'for example 25');
  const limit = q.limit === undefined ? DEF : q.limit;
  if (!(Number.isInteger(limit) && limit >= 1 && limit <= MAX)) return fail('limit', `must be 1 to ${MAX}`, `1 to ${MAX}`);
  const offset = q.cursor === undefined ? 0 : Number(/^o(\d+)$/.exec(q.cursor)?.[1] ?? NaN);
  if (!Number.isInteger(offset)) return fail('cursor', 'not a cursor this board gave', 'a next_cursor value');
  const has = e => e.owner.record.confirmed_received > 0;
  const late = e => e.owner.record.says_not_received > 0 || (e.owner.record.oldest_owed_days ?? 0) > LATE_DAYS;
  let list = Object.values(details).filter(e => OPEN.has(e.state));
  if (q.language) list = list.filter(e => e.repository.language.toLowerCase() === String(q.language).toLowerCase());
  if (q.repository) list = list.filter(e => e.repository.name === q.repository);
  if (q.min_reward !== undefined) list = list.filter(e => e.reward.amount >= q.min_reward);
  if (q.max_age_days !== undefined) list = list.filter(e => e.age_days <= q.max_age_days);
  if (q.solutions === 'none') list = list.filter(e => e.solutions.open === 0);
  if (q.solutions === 'some') list = list.filter(e => e.solutions.open > 0);
  if (q.owner_record === 'confirmed-payments') list = list.filter(has);
  if (q.owner_record === 'confirmed-none-late') list = list.filter(e => has(e) && !late(e));
  if (q.owner_record === 'no-history') list = list.filter(e => !e.owner.record.has_history);
  if (q.approved_by) list = list.filter(e => e.approved_by === q.approved_by);
  if (q.query) { const t = String(q.query).toLowerCase(); list = list.filter(e => e.poster_says.title.toLowerCase().includes(t) || e.repository.name.includes(t)); }
  list.sort(q.sort === 'reward' ? (x, y) => y.reward.amount - x.reward.amount : (x, y) => Date.parse(y.posted_at) - Date.parse(x.posted_at));
  const page = list.slice(offset, offset + limit);
  const entryKeys = Object.keys(index.bounties[0] ?? {});
  return {
    count: list.length,
    next_cursor: offset + limit < list.length ? `o${offset + limit}` : null,
    read_at: index.read_at,
    legend: index.legend,
    bounties: page.map(e => Object.fromEntries(entryKeys.map(k => [k, k === 'poster_says' ? { title: e.poster_says.title } : e[k]]))),
  };
}

export function getBounty(q = {}) {
  if (typeof q.id !== 'string' || !/^bt-[0-9a-f]{12}$/.test(q.id)) return fail('id', 'must be bt- followed by 12 lowercase hex digits', 'an id from find_bounties');
  const b = details[q.id];
  if (!b) return { error: tools.errors['not-found'].replace('{id}', q.id) };
  return { read_at: index.read_at, bounty: b };
}

const call = (name, args) => name === 'find_bounties' ? findBounties(args) : name === 'get_bounty' ? getBounty(args) : { error: `Unknown tool ${name}. Next: find_bounties or get_bounty.` };

function serveStdio() {
  let buf = '';
  const send = m => process.stdout.write(`${JSON.stringify(m)}\n`);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
      if (msg.id === undefined) continue; // notification
      if (msg.method === 'initialize') send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: msg.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: tools.server.name, title: tools.server.title, version: '0.0.0-sample' }, instructions: tools.server.instructions } });
      else if (msg.method === 'tools/list') send({ jsonrpc: '2.0', id: msg.id, result: { tools: tools.tools } });
      else if (msg.method === 'tools/call') {
        const out = call(msg.params?.name, msg.params?.arguments ?? {});
        send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], ...(out.error ? { isError: true } : { structuredContent: out }) } });
      } else if (msg.method === 'ping') send({ jsonrpc: '2.0', id: msg.id, result: {} });
      else send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , mode, json] = process.argv;
  if (mode === '--stdio') serveStdio();
  else if (mode === 'find_bounties' || mode === 'get_bounty') {
    let args; try { args = json ? JSON.parse(json) : {}; } catch { console.error('The second argument must be JSON, for example \'{"language":"TypeScript"}\'.'); process.exit(2); }
    const out = call(mode, args);
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.error ? 1 : 0);
  } else {
    console.log('Usage:\n  node standin.mjs find_bounties \'{"language":"TypeScript"}\'\n  node standin.mjs get_bounty \'{"id":"bt-0123456789ab"}\'\n  node standin.mjs --stdio   (MCP over stdio)\nTools and their inputs: feed/mcp/tools.json');
  }
}
