// BT59: GitHub's API as an HTTP stand-in on 127.0.0.1, for the token transport. Each request is answered by the same gh
// stand-in script the fixture writes (standin.cjs), run as `gh api <endpoint>`, so both transports answer from one source.
// The folder it is given holds config.json (which world to answer for, and any scripted failure or redirect, reread on
// every request) and requests.jsonl (every request received: method, path, the authorization header).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const folder = process.argv[2];
const config = () => JSON.parse(fs.readFileSync(path.join(folder, 'config.json'), 'utf8'));

const server = http.createServer((request, response) => {
  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    fs.appendFileSync(path.join(folder, 'requests.jsonl'), JSON.stringify({ method: request.method, path: request.url, authorization: request.headers.authorization ?? null }) + '\n');
    const world = config();
    if (world.redirect && request.url !== '/landing') { response.writeHead(302, { location: `http://127.0.0.1:${server.address().port}/landing` }); response.end(); return; }
    if (world.failure && request.url.includes(world.failure.on)) { response.writeHead(world.failure.status, world.failure.headers ?? {}); response.end(world.failure.body ?? ''); return; }
    const endpoint = request.url.replace(/^\//, '');
    const args = ['api', '--hostname', 'github.com', endpoint, '--include'];
    if (body !== '') {
      const input = path.join(folder, `input-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      fs.writeFileSync(input, body);
      args.push('--method', request.method, '--input', input);
    }
    const ran = spawnSync(process.execPath, [world.standin, ...args], {
      encoding: 'utf8', windowsHide: true,
      env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, BT6_GH_STATE: world.state, BT8A_GIT_REMOTE: world.bare, BT6_GH_REMOTE_URL: world.remoteUrl }
    });
    const out = ran.stdout ?? '';
    const head = /^HTTP\/[\d.]+ (\d{3})/.exec(out);
    if (head !== null) {
      const end = out.search(/\r?\n\r?\n/);
      const headers = {};
      for (const line of out.slice(0, end).split(/\r?\n/).slice(1)) { const at = line.indexOf(':'); if (at > 0) headers[line.slice(0, at).trim()] = line.slice(at + 1).trim(); }
      response.writeHead(Number(head[1]), headers);
      response.end(out.slice(end).replace(/^\r?\n\r?\n/, ''));
      return;
    }
    response.writeHead(ran.status === 0 ? 200 : 404, { 'content-type': 'application/json' });
    response.end(out);
  });
});
server.listen(0, '127.0.0.1', () => { process.stdout.write(`listening ${server.address().port}\n`); });
