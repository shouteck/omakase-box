// A stand-in board for PF5, in its own process because the tool's calls block
// the test's. Answers from routes.json (a test rewrites it at will) and appends
// every request it receives to requests.jsonl.
const { appendFileSync, readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { join } = require('node:path');

const folder = process.argv[2];
const server = createServer((request, response) => {
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    appendFileSync(join(folder, 'requests.jsonl'), `${JSON.stringify({ method: request.method, path: request.url, body, headers: request.headers })}\n`);
    let routes = {};
    try { routes = JSON.parse(readFileSync(join(folder, 'routes.json'), 'utf8')); } catch { routes = {}; }
    const route = routes[request.url] ?? (request.url === '/api/hint' ? { status: 202, body: { looked: 'read' } } : { status: 404, body: { error: 'no' } });
    response.writeHead(route.status, { 'content-type': 'application/json', ...(route.headers ?? {}) });
    response.end(typeof route.body === 'string' ? route.body : JSON.stringify(route.body));
  });
});
server.listen(0, '127.0.0.1', () => process.stdout.write(`listening ${server.address().port}\n`));
