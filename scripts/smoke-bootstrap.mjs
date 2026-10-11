import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { developmentEnvironment, root } from './process.mjs';

function localRequest(port, hostname, path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { Host: `${hostname}:${port}` }, timeout: 1000 }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk.toString(); });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timed out.')));
    req.end();
  });
}
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const commands = [
  ['services/private-api/dist/main.js'],
  ['services/external-api/dist/main.js'],
  [vite, 'apps/private-console', '--host', '127.0.0.1', '--port', '3000', '--strictPort'],
  [vite, 'apps/contributor-portal', '--host', '127.0.0.1', '--port', '3001', '--strictPort']
];
const children = commands.map(args => spawn(process.execPath, args, { cwd: root, stdio: 'ignore', env: developmentEnvironment() }));
let startupFailure = false;
for (const child of children) {
  child.on('error', () => { startupFailure = true; });
  child.on('exit', () => { startupFailure = true; });
}
try {
  for (const [port, host, expected] of [
    [4000, 'private.localhost', 'private-api'],
    [4001, 'contributor.localhost', 'external-api'],
    [3000, 'private.localhost', 'Private task console'],
    [3001, 'contributor.localhost', 'Contributor portal']
  ]) {
    let response;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (startupFailure) throw new Error('A bootstrap child failed to start.');
      try {
        response = await localRequest(port, host, port >= 4000 ? '/health' : '/');
        break;
      } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(response, 'Bootstrap listener did not become ready.');
    assert.equal(response.status, 200);
    assert.ok(response.body.includes(expected));
    console.log(JSON.stringify({ assurance: 'tested', host, port, result: 'reachable', hostHeaderOverride: true }));
  }
  const privateSource = fileURLToPath(new URL('../services/private-api/bootstrap/owner.ts', import.meta.url)).replaceAll('\\', '/');
  const denied = await localRequest(3001, 'contributor.localhost', '/@fs/' + privateSource);
  assert.equal(denied.status, 403, 'Contributor dev server must not serve private workspace source.');
  assert.ok(!denied.body.includes('bootstrapOwner'));
  assert.deepEqual(JSON.parse(denied.body), { error: 'forbidden' });
  console.log(JSON.stringify({ assurance: 'tested', contributorDevServerPrivateSource: 'denied' }));
  for (const port of [4000, 4001]) {
    const response = await localRequest(port, 'attacker.invalid', '/health');
    assert.equal(response.status, 403);
    assert.deepEqual(JSON.parse(response.body), { error: 'forbidden' });
  }
} finally {
  for (const child of children) child.kill();
}
